-- =====================================================================
-- AI ad optimization loop (Meta Marketing API), human-in-the-loop.
--
--   sync → baseline → diagnosis → hypothesis → creative drafts → human
--   approval → experiment (A/B) → results → winner detection → Creative
--   Memory → next creative
--
-- Reuses existing tables: campaigns / ad_sets / ads / creatives (extended),
-- content_learnings (Marketing Memory; kind='creative' = Creative Memory),
-- ai_recommendations (source='ads'), social_event_logs (audit log).
-- New tables only where nothing existed: ad accounts + token vault,
-- daily metric snapshots, first-party conversions, AI analyses,
-- creative hypotheses, experiments + variants.
--
-- Security: members READ via RLS (incl. location scope). Every write of the
-- loop goes through the server (service role) after an explicit permission
-- check; provider-synced fields cannot be forged with the anon key.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ad accounts (public part) + token vault (service role only)
-- ---------------------------------------------------------------------
create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  provider text not null default 'meta' check (provider in ('meta')),
  business_id text,
  external_account_id text not null, -- "act_<id>"
  name text not null default '',
  currency char(3) not null default 'JPY',
  timezone text not null default 'Asia/Tokyo',
  account_status text,
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'expired', 'error', 'disconnected', 'reauthorization_required')),
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  connection_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

create table public.ad_account_credentials (
  ad_account_id uuid primary key references public.ad_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  access_token_ciphertext text not null, -- AES-256-GCM (SOCIAL_TOKEN_ENCRYPTION_KEY)
  token_kind text not null default 'user' check (token_kind in ('user', 'system_user')),
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_account_credentials enable row level security;
revoke all on table public.ad_account_credentials from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Extend campaigns / ad_sets / ads / creatives (synced structure)
-- ---------------------------------------------------------------------
alter table public.campaigns add column ad_account_id uuid references public.ad_accounts (id) on delete cascade;
alter table public.campaigns add column goal text not null default 'acquisition'
  check (goal in ('acquisition', 'recruitment', 'branding', 'engagement', 'retention', 'custom'));
alter table public.campaigns add column effective_status text;
alter table public.campaigns add column lifetime_budget numeric(14, 2);
alter table public.campaigns add column special_ad_categories text[] not null default '{}';
alter table public.campaigns add column landing_page_url text;
alter table public.campaigns add column start_time timestamptz;
alter table public.campaigns add column stop_time timestamptz;
alter table public.campaigns add column conversion_event text; -- e.g. "Schedule", "Lead", "SubmitApplication"
alter table public.campaigns add column last_synced_at timestamptz;
alter table public.campaigns add column raw jsonb not null default '{}'::jsonb;

alter table public.ad_sets add column location_id uuid references public.locations (id) on delete set null;
alter table public.ad_sets add column effective_status text;
alter table public.ad_sets add column optimization_goal text;
alter table public.ad_sets add column billing_event text;
alter table public.ad_sets add column daily_budget numeric(14, 2);
alter table public.ad_sets add column promoted_object jsonb;
alter table public.ad_sets add column audience_label text not null default ''; -- human summary ("30代女性 渋谷勤務 デスクワーク")
alter table public.ad_sets add column last_synced_at timestamptz;
alter table public.ad_sets add column raw jsonb not null default '{}'::jsonb;
create unique index campaigns_external_unique on public.campaigns (organization_id, external_id) where external_id is not null;
create unique index ad_sets_external_unique on public.ad_sets (organization_id, external_id) where external_id is not null;

alter table public.ads add column campaign_id uuid references public.campaigns (id) on delete cascade;
alter table public.ads add column location_id uuid references public.locations (id) on delete set null;
alter table public.ads add column effective_status text;
alter table public.ads add column landing_page_url text;
alter table public.ads add column provider_created_at timestamptz;
alter table public.ads add column review_feedback jsonb;
alter table public.ads add column last_synced_at timestamptz;
alter table public.ads add column raw jsonb not null default '{}'::jsonb;
create unique index ads_external_unique on public.ads (organization_id, external_id) where external_id is not null;

-- Creatives = synced ad creatives AND AI / human drafts (CreativeVariant).
alter table public.creatives add column ad_account_id uuid references public.ad_accounts (id) on delete set null;
alter table public.creatives add column location_id uuid references public.locations (id) on delete set null;
alter table public.creatives add column external_id text;
alter table public.creatives add column source text not null default 'manual' check (source in ('synced', 'ai_generated', 'manual'));
alter table public.creatives add column goal text;
alter table public.creatives add column hook text not null default '';
alter table public.creatives add column angle text not null default '';
alter table public.creatives add column persona text not null default '';
alter table public.creatives add column pain_point text not null default '';
alter table public.creatives add column offer text not null default '';
alter table public.creatives add column first_view_copy text not null default '';
alter table public.creatives add column visual_direction text not null default '';
alter table public.creatives add column video_script jsonb; -- { hook, scenes[], onScreenText[] }
alter table public.creatives add column brief jsonb;        -- Creative Brief used to generate it
alter table public.creatives add column thumbnail_url text;
alter table public.creatives add column landing_page_url text;
alter table public.creatives add column hypothesis_id uuid;
alter table public.creatives add column parent_creative_id uuid references public.creatives (id) on delete set null;
alter table public.creatives add column variable_changed text;
alter table public.creatives add column approved_by uuid references auth.users (id) on delete set null;
alter table public.creatives add column approved_at timestamptz;
alter table public.creatives add column rejected_reason text;
alter table public.creatives add column ai_provider text;
alter table public.creatives drop constraint if exists creatives_status_check;
alter table public.creatives add constraint creatives_status_check
  check (status in ('draft', 'in_review', 'approved', 'rejected', 'published', 'archived', 'active', 'paused'));
create unique index creatives_external_unique on public.creatives (organization_id, external_id) where external_id is not null;

-- Provider-synced fields are written by the server only (no forged spend / status).
create or replace function public.guard_ad_sync_fields()
returns trigger
language plpgsql
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
begin
  if auth.uid() is null then
    return new;
  end if;
  foreach k in array array['external_id', 'effective_status', 'daily_budget', 'lifetime_budget', 'targeting', 'optimization_goal', 'raw', 'last_synced_at', 'ad_account_id'] loop
    if (o ? k) and (o -> k) is distinct from (n -> k) then
      raise exception 'provider-synced field % is managed by the server', k using errcode = '42501';
    end if;
  end loop;
  if tg_table_name = 'creatives' and (n ->> 'status') in ('approved', 'published', 'active', 'paused')
     and (o ->> 'status') is distinct from (n ->> 'status') then
    raise exception 'creative approval / publishing is managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['campaigns', 'ad_sets', 'ads', 'creatives'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.guard_ad_sync_fields()', t || '_guard_sync', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Daily metric snapshots (time series; restated days are re-synced)
-- ---------------------------------------------------------------------
create table public.ad_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ad_account_id uuid references public.ad_accounts (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  entity_type text not null check (entity_type in ('account', 'campaign', 'ad_set', 'ad')),
  entity_id uuid not null,
  date date not null,          -- date_start (time_increment=1)
  date_stop date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint,
  frequency numeric(8, 3),
  clicks bigint not null default 0,       -- link clicks
  landing_page_views bigint,
  conversions numeric(12, 2) not null default 0, -- provider-reported (goal event)
  revenue numeric(14, 2),
  video_3s_views bigint,
  thruplays bigint,
  ctr numeric(10, 6),
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  cvr numeric(10, 6),
  cpa numeric(14, 4),
  roas numeric(10, 4),
  raw_metrics jsonb not null default '{}'::jsonb,
  source text not null default 'provider' check (source in ('provider', 'mock')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, date)
);
create index ad_metric_snapshots_lookup on public.ad_metric_snapshots (organization_id, entity_type, entity_id, date desc);

-- ---------------------------------------------------------------------
-- 4. First-party conversions (manual / CSV / future booking & ATS APIs)
--    Kept separate from provider-reported conversions on purpose.
-- ---------------------------------------------------------------------
create table public.ad_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  kind text not null check (kind in ('lead', 'reservation', 'visit', 'contract', 'application', 'revenue')),
  occurred_on date not null,
  count integer not null default 1 check (count >= 0),
  revenue numeric(14, 2),
  source text not null default 'manual' check (source in ('manual', 'csv', 'api')),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ad_conversions_org_idx on public.ad_conversions (organization_id, occurred_on desc);

-- ---------------------------------------------------------------------
-- 5. AI analyses, creative hypotheses, experiments
-- ---------------------------------------------------------------------
create table public.ai_ad_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  period_start date not null,
  period_end date not null,
  summary text not null default '',
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  ai_provider text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.creative_hypotheses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  analysis_id uuid references public.ai_ad_analyses (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_set_id uuid references public.ad_sets (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  goal text not null default 'acquisition',
  problem text not null,
  hypothesis text not null,
  change_variable text not null check (change_variable in (
    'hook', 'visual', 'persona', 'offer', 'cta', 'social_proof', 'before_after', 'problem_angle', 'expertise_angle', 'price', 'format', 'landing_page'
  )),
  test_idea text not null default '',
  expected_result text not null default '',
  primary_metric text not null default 'cpa' check (primary_metric in ('cpa', 'cvr', 'ctr', 'roas', 'cpc', 'application_cpa')),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'in_test', 'validated', 'invalidated')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.creatives add constraint creatives_hypothesis_fk
  foreign key (hypothesis_id) references public.creative_hypotheses (id) on delete set null;

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_set_id uuid references public.ad_sets (id) on delete set null,
  hypothesis_id uuid references public.creative_hypotheses (id) on delete set null,
  name text not null,
  goal text not null default 'acquisition',
  variable text not null, -- the ONE main variable this test changes
  hypothesis text not null default '',
  primary_metric text not null default 'cpa',
  secondary_metrics text[] not null default '{ctr,cvr}',
  -- { minLiftPct, minSpend, minImpressions, minClicks, minConversions, minDays, maxFrequency }
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  control_variant_id uuid,
  status text not null default 'draft' check (status in ('draft', 'approved', 'running', 'completed', 'cancelled')),
  decision text check (decision in ('winner', 'inconclusive', 'insufficient_data')),
  winner_variant_id uuid,
  result_summary jsonb,
  start_date date,
  end_date date,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  launched_by uuid references auth.users (id) on delete set null,
  launched_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  role text not null check (role in ('control', 'challenger')),
  label text not null, -- A / B / C
  creative_id uuid references public.creatives (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  provider_ad_id text,
  variable_changed text not null default '',
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric(12, 2) not null default 0,
  revenue numeric(14, 2),
  frequency numeric(8, 3),
  ctr numeric(10, 6),
  cvr numeric(10, 6),
  cpa numeric(14, 4),
  roas numeric(10, 4),
  decision text check (decision in ('winner', 'loser', 'inconclusive', 'insufficient_data')),
  metrics_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_id, label)
);
alter table public.experiments add constraint experiments_control_fk
  foreign key (control_variant_id) references public.experiment_variants (id) on delete set null;
alter table public.experiments add constraint experiments_winner_fk
  foreign key (winner_variant_id) references public.experiment_variants (id) on delete set null;

-- ---------------------------------------------------------------------
-- 6. Creative Memory = content_learnings kind='creative'
-- ---------------------------------------------------------------------
alter table public.content_learnings add column kind text not null default 'content' check (kind in ('content', 'creative'));
-- { persona, painPoint, hook, angle, visual, cta, offer, format, platform, industry, goal, variable, winningPattern, why }
alter table public.content_learnings add column attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object');
alter table public.content_learnings add column source_experiment_id uuid references public.experiments (id) on delete set null;

alter table public.ai_recommendations drop constraint if exists ai_recommendations_source_check;
alter table public.ai_recommendations add constraint ai_recommendations_source_check
  check (source in ('operations', 'performance', 'manual', 'ads'));

-- Audit log: ad loop events (who approved what is in actor_user_id + details).
alter table public.social_event_logs drop constraint if exists social_event_logs_event_type_check;
alter table public.social_event_logs add constraint social_event_logs_event_type_check check (event_type in (
  'account_connected', 'account_disconnected', 'account_reauthorization_required', 'token_refreshed', 'token_refresh_failed',
  'post_approved', 'publish_queued', 'publish_cancelled', 'publish_started', 'publish_success', 'publish_failed', 'publish_retry_scheduled',
  'insights_synced', 'insights_failed', 'review_generated', 'learning_saved',
  'recommendation_generated', 'recommendation_approved', 'recommendation_rejected', 'webhook_received',
  'ad_account_connected', 'ad_account_disconnected', 'ads_synced', 'ads_sync_failed', 'ad_analysis_generated',
  'hypothesis_generated', 'hypothesis_accepted', 'hypothesis_rejected',
  'creative_draft_generated', 'creative_approved', 'creative_rejected', 'creative_edited',
  'experiment_created', 'experiment_approved', 'experiment_started', 'experiment_completed', 'experiment_cancelled',
  'winner_selected', 'ad_paused', 'ad_activated', 'conversions_recorded'
));

-- ---------------------------------------------------------------------
-- 7. RLS, triggers, grants
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ad_accounts', 'ad_account_credentials', 'creative_hypotheses', 'experiments', 'experiment_variants'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['ad_accounts', 'ad_metric_snapshots', 'ad_conversions', 'ai_ad_analyses', 'creative_hypotheses', 'experiments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.assert_same_org_refs()', t || '_same_org_refs', t);
    execute format('create policy %I on public.%I for select using (public.can_access_location(organization_id, location_id))', t || ': members read', t);
  end loop;
end;
$$;

alter table public.experiment_variants enable row level security;
create policy "experiment_variants: members read" on public.experiment_variants for select using (
  exists (select 1 from public.experiments e where e.id = experiment_id and public.can_access_location(e.organization_id, e.location_id))
);

-- Same-organization guards for the new references.
create or replace function public.assert_ads_refs_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := to_jsonb(new);
  r uuid;
begin
  r := nullif(v ->> 'campaign_id', '')::uuid;
  if r is not null and not exists (select 1 from public.campaigns where id = r and organization_id = new.organization_id) then
    raise exception 'campaign does not belong to organization' using errcode = '42501';
  end if;
  r := nullif(v ->> 'ad_set_id', '')::uuid;
  if r is not null and not exists (select 1 from public.ad_sets where id = r and organization_id = new.organization_id) then
    raise exception 'ad set does not belong to organization' using errcode = '42501';
  end if;
  r := nullif(v ->> 'ad_id', '')::uuid;
  if r is not null and not exists (select 1 from public.ads where id = r and organization_id = new.organization_id) then
    raise exception 'ad does not belong to organization' using errcode = '42501';
  end if;
  r := nullif(v ->> 'creative_id', '')::uuid;
  if r is not null and not exists (select 1 from public.creatives where id = r and organization_id = new.organization_id) then
    raise exception 'creative does not belong to organization' using errcode = '42501';
  end if;
  r := nullif(v ->> 'experiment_id', '')::uuid;
  if r is not null and not exists (select 1 from public.experiments where id = r and organization_id = new.organization_id) then
    raise exception 'experiment does not belong to organization' using errcode = '42501';
  end if;
  r := nullif(v ->> 'ad_account_id', '')::uuid;
  if r is not null and not exists (select 1 from public.ad_accounts where id = r and organization_id = new.organization_id) then
    raise exception 'ad account does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['campaigns', 'ads', 'creatives', 'ad_metric_snapshots', 'ad_conversions', 'ai_ad_analyses', 'creative_hypotheses', 'experiments', 'experiment_variants', 'ad_account_credentials'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.assert_ads_refs_same_org()', t || '_ads_refs_same_org', t);
  end loop;
end;
$$;

grant select on public.ad_accounts, public.ad_metric_snapshots, public.ad_conversions, public.ai_ad_analyses,
  public.creative_hypotheses, public.experiments, public.experiment_variants to authenticated;
revoke all on public.ad_accounts, public.ad_metric_snapshots, public.ad_conversions, public.ai_ad_analyses,
  public.creative_hypotheses, public.experiments, public.experiment_variants from anon;

-- Location references on the extended structure tables stay inside the organization.
create trigger ad_sets_same_org_refs before insert or update on public.ad_sets
  for each row execute function public.assert_same_org_refs();
create trigger ads_same_org_refs before insert or update on public.ads
  for each row execute function public.assert_same_org_refs();
