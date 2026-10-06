-- =====================================================================
-- Social publishing loop: real Instagram / Threads connections,
-- Publish Queue, media storage, insights snapshots, AI performance
-- reviews, Marketing Memory (content learnings) and an event log.
--
-- Security model
--   * OAuth tokens live ONLY in social_account_credentials /
--     social_oauth_pending: RLS enabled with NO policies and all grants
--     revoked, so only the service role (server-side worker) can read them.
--     Tokens are additionally encrypted by the app (AES-256-GCM).
--   * Members READ queue / metrics / reviews / logs through RLS. All state
--     changes of the publishing pipeline are written by the server with the
--     service role after an explicit permission check, so a browser holding
--     the anon key can never mark a job as published or touch a token.
--   * Location scope: organization_members.location_ids (null = all
--     locations). New tables enforce it in RLS via can_access_location().
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Timezones (timestamps stay timestamptz/UTC; tz is for input/display)
-- ---------------------------------------------------------------------
alter table public.organizations add column timezone text not null default 'Asia/Tokyo'
  check (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)*$');
-- locations.timezone already exists (default 'Asia/Tokyo'); validate its format too.
alter table public.locations add constraint locations_timezone_format
  check (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)*$');

-- ---------------------------------------------------------------------
-- 2. Location-scoped members (future: Location Manager role)
--    null = every location + HQ accounts; otherwise only these locations.
-- ---------------------------------------------------------------------
alter table public.organization_members add column location_ids uuid[];

create or replace function public.can_access_location(p_org uuid, p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and (m.location_ids is null or (p_location is not null and p_location = any (m.location_ids)))
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Social account connection (public, non-secret part)
-- ---------------------------------------------------------------------
alter table public.social_accounts drop constraint if exists social_accounts_connection_status_check;
alter table public.social_accounts add constraint social_accounts_connection_status_check
  check (connection_status in ('manual', 'connected', 'expired', 'error', 'disconnected', 'reauthorization_required'));
alter table public.social_accounts add column username text not null default '';
alter table public.social_accounts add column profile_image_url text;
alter table public.social_accounts add column token_expires_at timestamptz;
alter table public.social_accounts add column scopes text[] not null default '{}';
alter table public.social_accounts add column connected_at timestamptz;
alter table public.social_accounts add column connected_by uuid references auth.users (id) on delete set null;
alter table public.social_accounts add column last_synced_at timestamptz;
alter table public.social_accounts add column connection_error text;
-- Non-secret provider data (account_type, followers_count, ...). Never tokens.
alter table public.social_accounts add column provider_metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(provider_metadata) = 'object');
create unique index social_accounts_external_unique
  on public.social_accounts (organization_id, platform, external_account_id)
  where external_account_id is not null;

-- ---------------------------------------------------------------------
-- 4. Token vault (service role only)
-- ---------------------------------------------------------------------
create table public.social_account_credentials (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.social_platform not null,
  external_account_id text not null,
  -- "v1:<iv>:<tag>:<ciphertext>" (AES-256-GCM, key = SOCIAL_TOKEN_ENCRYPTION_KEY)
  access_token_ciphertext text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  last_refreshed_at timestamptz,
  refresh_failures smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Short-lived OAuth result waiting for the user to pick the target account.
create table public.social_oauth_pending (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.social_platform not null,
  -- Public profile candidates shown on the selection screen (no tokens).
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  access_token_ciphertext text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.social_account_credentials enable row level security;
alter table public.social_oauth_pending enable row level security;
revoke all on table public.social_account_credentials from anon, authenticated;
revoke all on table public.social_oauth_pending from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Post lifecycle for publishing
--    draft → scheduled(予定) → approved → queued → publishing → published | failed
-- ---------------------------------------------------------------------
alter type public.post_status add value if not exists 'approved';
alter type public.post_status add value if not exists 'queued';
alter type public.post_status add value if not exists 'publishing';

alter table public.posts add column approved_by uuid references auth.users (id) on delete set null;
alter table public.posts add column approved_at timestamptz;
alter table public.posts add column published_at timestamptz;
alter table public.posts add column provider_post_id text;
alter table public.posts add column permalink text;
alter table public.posts add column publish_error text;

-- ---------------------------------------------------------------------
-- 6. Media assets (files live in the private "social-media" bucket:
--    <organization_id>/<location_id|hq>/posts/<post_id>/<asset_id>.<ext>)
-- ---------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  post_id uuid references public.posts (id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  sort_order smallint not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_post_idx on public.media_assets (post_id, sort_order);

-- ---------------------------------------------------------------------
-- 7. Publish Queue
-- ---------------------------------------------------------------------
create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  provider public.social_platform not null,
  publish_format text not null,
  mode text not null default 'scheduled' check (mode in ('scheduled', 'immediate')),
  scheduled_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'publishing', 'retrying', 'published', 'failed', 'cancelled')),
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null,
  locked_until timestamptz,
  -- Exactly what the human approved (caption + media ids) — published verbatim.
  content_snapshot jsonb not null check (jsonb_typeof(content_snapshot) = 'object'),
  provider_container_id text,
  provider_post_id text,
  provider_permalink text,
  -- Sanitized provider responses only (no tokens / headers).
  provider_response jsonb,
  last_error text,
  last_error_code text,
  published_at timestamptz,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempt_count <= max_attempts)
);
create unique index publish_jobs_one_active_per_post on public.publish_jobs (post_id)
  where status in ('queued', 'publishing', 'retrying');
create index publish_jobs_due_idx on public.publish_jobs (status, next_attempt_at);
create index publish_jobs_org_idx on public.publish_jobs (organization_id, scheduled_at desc);

-- ---------------------------------------------------------------------
-- 8. Insights snapshots (time series: never overwritten)
-- ---------------------------------------------------------------------
create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  provider public.social_platform not null,
  scope text not null check (scope in ('post', 'account')),
  provider_post_id text,
  captured_at timestamptz not null default now(),
  -- Hours between publish and capture (post scope) for 24h / 3d / 7d comparisons.
  hours_since_publish numeric(8, 2),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (scope = 'account' or post_id is not null)
);
create index metric_snapshots_post_idx on public.metric_snapshots (post_id, captured_at desc);
create index metric_snapshots_account_idx on public.metric_snapshots (social_account_id, scope, captured_at desc);

-- ---------------------------------------------------------------------
-- 9. AI performance reviews and Marketing Memory
-- ---------------------------------------------------------------------
create table public.post_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  post_id uuid not null references public.posts (id) on delete cascade,
  snapshot_id uuid references public.metric_snapshots (id) on delete set null,
  summary text not null,
  what_worked text[] not null default '{}',
  what_did_not_work text[] not null default '{}',
  possible_reasons text[] not null default '{}',
  key_learning text not null default '',
  recommended_next_action text not null default '',
  next_creative_hypothesis text not null default '',
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  ai_provider text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index post_performance_reviews_post_idx on public.post_performance_reviews (post_id, created_at desc);

-- Marketing Memory: what we LEARNED from real operations (Brand Brain = what we KNOW about the company).
create table public.content_learnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  platform public.social_platform,
  goal text check (goal is null or goal in ('acquisition', 'recruitment', 'branding', 'engagement', 'retention', 'custom')),
  content_pillar text not null default '',
  hypothesis text not null default '',
  result text not null default '',
  learning text not null check (char_length(learning) between 1 and 1000),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  valid_from date not null default current_date,
  valid_until date,
  source_post_ids uuid[] not null default '{}',
  source_review_id uuid references public.post_performance_reviews (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_learnings_org_idx on public.content_learnings (organization_id, status, created_at desc);

alter table public.ai_recommendations add column source text not null default 'operations'
  check (source in ('operations', 'performance', 'manual'));
alter table public.ai_recommendations add column source_post_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------
-- 10. Event / audit log (append-only)
-- ---------------------------------------------------------------------
create table public.social_event_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  publish_job_id uuid references public.publish_jobs (id) on delete set null,
  event_type text not null check (event_type in (
    'account_connected', 'account_disconnected', 'account_reauthorization_required', 'token_refreshed', 'token_refresh_failed',
    'post_approved', 'publish_queued', 'publish_cancelled', 'publish_started', 'publish_success', 'publish_failed', 'publish_retry_scheduled',
    'insights_synced', 'insights_failed', 'review_generated', 'learning_saved',
    'recommendation_generated', 'recommendation_approved', 'recommendation_rejected', 'webhook_received'
  )),
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index social_event_logs_org_idx on public.social_event_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- 11. Triggers, RLS, grants
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['social_account_credentials', 'media_assets', 'publish_jobs', 'content_learnings'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
  foreach t in array array['media_assets', 'publish_jobs', 'metric_snapshots', 'post_performance_reviews', 'content_learnings', 'social_event_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.assert_same_org_refs()',
      t || '_same_org_refs', t
    );
    -- Members read rows of the locations they can access.
    execute format(
      'create policy %I on public.%I for select using (public.can_access_location(organization_id, location_id))',
      t || ': members read', t
    );
  end loop;
  -- Human-editable tables (pipeline tables are written by the server only).
  foreach t in array array['media_assets', 'content_learnings'] loop
    execute format(
      'create policy %I on public.%I for insert with check (public.can_edit_org(organization_id) and public.can_access_location(organization_id, location_id))',
      t || ': editors insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (public.can_edit_org(organization_id) and public.can_access_location(organization_id, location_id)) with check (public.can_edit_org(organization_id) and public.can_access_location(organization_id, location_id))',
      t || ': editors update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.can_edit_org(organization_id) and public.can_access_location(organization_id, location_id))',
      t || ': editors delete', t
    );
  end loop;
end;
$$;

-- publish_jobs / media_assets must reference a post of the same organization.
create or replace function public.assert_post_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_id is not null and not exists (
    select 1 from public.posts where id = new.post_id and organization_id = new.organization_id
  ) then
    raise exception 'post does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['media_assets', 'publish_jobs', 'metric_snapshots', 'post_performance_reviews'] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.assert_post_same_org()',
      t || '_post_same_org', t
    );
  end loop;
end;
$$;

-- End users (anon key, auth.uid() set) cannot drive the publishing state
-- machine or rewrite content that is already queued. The server uses the
-- service role (auth.uid() is null) for these transitions.
create or replace function public.guard_post_publishing_state()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status::text in ('queued', 'publishing') and new.status is distinct from old.status then
    raise exception 'publishing state is managed by the server' using errcode = '42501';
  end if;
  if old.status::text in ('queued', 'publishing') and (
    new.caption is distinct from old.caption or new.title is distinct from old.title
    or new.hashtags is distinct from old.hashtags or new.cta is distinct from old.cta
    or new.social_account_id is distinct from old.social_account_id or new.status is distinct from old.status
  ) then
    raise exception 'cancel the scheduled publish before editing' using errcode = '42501';
  end if;
  if new.provider_post_id is distinct from old.provider_post_id or new.published_at is distinct from old.published_at then
    raise exception 'publishing results are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_guard_publishing_state before update on public.posts
  for each row execute function public.guard_post_publishing_state();

create or replace function public.guard_post_insert_state()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and new.status::text in ('queued', 'publishing') then
    raise exception 'publishing state is managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_guard_insert_state before insert on public.posts
  for each row execute function public.guard_post_insert_state();

-- Connection fields are written by the OAuth callback (service role) only.
create or replace function public.guard_social_connection_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.external_account_id is distinct from old.external_account_id
    or new.token_expires_at is distinct from old.token_expires_at
    or new.scopes is distinct from old.scopes
    or new.connected_at is distinct from old.connected_at
    or (new.connection_status is distinct from old.connection_status and new.connection_status <> 'manual') then
    raise exception 'connection fields are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger social_accounts_guard_connection before update on public.social_accounts
  for each row execute function public.guard_social_connection_fields();

grant select, insert, update, delete on public.media_assets, public.content_learnings to authenticated;
grant select on public.publish_jobs, public.metric_snapshots, public.post_performance_reviews, public.social_event_logs to authenticated;
revoke all on public.media_assets, public.content_learnings, public.publish_jobs, public.metric_snapshots,
  public.post_performance_reviews, public.social_event_logs from anon;

-- ---------------------------------------------------------------------
-- 12. Private storage bucket (Supabase only; skipped on plain Postgres).
--     No storage policies: uploads use server-issued signed upload URLs and
--     reads use short-lived signed URLs, both created with the service role.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('social-media', 'social-media', false, 1073741824,
            array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
    on conflict (id) do nothing;
  end if;
end;
$$;
