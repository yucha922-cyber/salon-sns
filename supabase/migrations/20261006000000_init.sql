-- =====================================================================
-- NAORU AI Marketing Partner — initial schema
--
-- Multi-tenant design:
--   * Every tenant-owned row carries organization_id.
--   * Access is granted only through organization_members (RLS).
--   * A user can belong to many organizations.
--   * Demo organizations are flagged with organizations.is_demo so demo
--     data never mixes with production data.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Users / organizations
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text unique,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.organization_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Membership checks are SECURITY DEFINER so RLS policies on
-- organization_members do not recurse.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
  );
$$;

create or replace function public.can_edit_org(p_org uuid)
returns boolean
language sql
stable
as $$
  select public.has_org_role(p_org, array['owner', 'admin', 'editor']::public.organization_role[]);
$$;

-- ---------------------------------------------------------------------
-- Brand Brain
-- ---------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default '',
  -- industry_key is a free slug ('seitai', 'esthetic', 'restaurant', 'custom', ...)
  -- so new verticals can be added without a migration.
  industry_key text not null default 'custom',
  industry_label text not null default '',
  business_description text not null default '',
  website text not null default '',
  service_description text not null default '',
  brand_personality text[] not null default '{}',
  brand_tone text[] not null default '{}',
  writing_tone text not null default '',
  ai_context text not null default '',
  onboarding_step smallint not null default 0,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brands_org_idx on public.brands (organization_id);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null unique references public.brands (id) on delete cascade,
  company_name text not null default '',
  strengths text[] not null default '{}',
  features text[] not null default '{}',
  differentiators text[] not null default '{}',
  marketing_goals text not null default '',
  social_goals text not null default '',
  advertising_goals text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  name text not null,
  address text not null default '',
  timezone text not null default 'Asia/Tokyo',
  is_primary boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_org_idx on public.locations (organization_id);
create index locations_brand_idx on public.locations (brand_id);

create table public.target_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  summary text not null default '',
  age_range text not null default '',
  gender text not null default '',
  occupation text not null default '',
  pain_points text[] not null default '{}',
  use_cases text[] not null default '{}',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index target_audiences_brand_idx on public.target_audiences (brand_id);

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  target_audience_id uuid references public.target_audiences (id) on delete set null,
  name text not null,
  description text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personas_brand_idx on public.personas (brand_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(12, 2) check (price is null or price >= 0),
  currency char(3) not null default 'JPY',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_brand_idx on public.services (brand_id);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  note text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competitors_brand_idx on public.competitors (brand_id);

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  kind text not null default 'reference' check (kind in ('logo', 'image', 'video', 'document', 'reference')),
  title text not null default '',
  storage_path text,
  url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brand_assets_brand_idx on public.brand_assets (brand_id);

create type public.social_platform as enum ('instagram', 'threads', 'tiktok', 'facebook', 'x', 'youtube', 'line');

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  platform public.social_platform not null,
  handle text not null default '',
  -- 'manual' = handle entered in Brand Brain, not yet connected via OAuth.
  connection_status text not null default 'manual'
    check (connection_status in ('manual', 'connected', 'expired', 'error')),
  external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform)
);
-- OAuth tokens will live in a separate server-only table / vault, never here.

-- ---------------------------------------------------------------------
-- SNS posts
-- ---------------------------------------------------------------------
create type public.post_status as enum ('draft', 'scheduled', 'published', 'failed');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  platform public.social_platform not null,
  content_type text not null default 'feed',
  title text not null default '',
  caption text not null default '',
  cta text not null default '',
  hashtags text[] not null default '{}',
  status public.post_status not null default 'draft',
  source text not null default 'manual' check (source in ('manual', 'ai_post_creator', 'ai_planner', 'demo')),
  generation_input jsonb,
  ai_provider text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_org_idx on public.posts (organization_id, created_at desc);

create table public.post_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  scheduled_at timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index post_schedules_org_time_idx on public.post_schedules (organization_id, scheduled_at);
create unique index post_schedules_one_active_per_post on public.post_schedules (post_id) where status <> 'cancelled';

-- ---------------------------------------------------------------------
-- Advertising (read-only sync target; no automatic changes in MVP)
-- ---------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  provider text not null default 'meta',
  external_id text,
  name text not null,
  objective text,
  status text not null default 'draft',
  daily_budget numeric(12, 2),
  currency char(3) not null default 'JPY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  external_id text,
  name text not null,
  status text not null default 'draft',
  targeting jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  concept text not null default '',
  headline text not null default '',
  body text not null default '',
  cta text not null default '',
  format text,
  asset_id uuid references public.brand_assets (id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ad_set_id uuid not null references public.ad_sets (id) on delete cascade,
  creative_id uuid references public.creatives (id) on delete set null,
  external_id text,
  name text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generic metric facts: one row per (entity, metric, period).
create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('organization', 'location', 'social_account', 'post', 'campaign', 'ad_set', 'ad')),
  entity_id uuid,
  metric text not null,
  value numeric not null,
  period_start date not null,
  period_end date not null,
  source text not null default 'manual',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index metrics_lookup_idx on public.metrics (organization_id, entity_type, entity_id, metric, period_start);

-- ---------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------
create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  kind text not null,
  title text not null,
  observation text not null default '',
  hypothesis text not null default '',
  proposal text not null default '',
  impact text,
  -- Human-in-the-loop: nothing is applied without explicit approval.
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'dismissed', 'applied')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  title text not null default '新しい相談',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_org_idx on public.ai_conversations (organization_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  ai_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'organizations', 'organization_members', 'brands', 'business_profiles',
    'locations', 'target_audiences', 'personas', 'services', 'competitors', 'brand_assets',
    'social_accounts', 'posts', 'post_schedules', 'campaigns', 'ad_sets', 'creatives', 'ads',
    'metrics', 'ai_recommendations', 'ai_conversations', 'ai_messages'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.organizations enable row level security;
create policy "organizations: members read" on public.organizations
  for select using (public.is_org_member(id));
create policy "organizations: admins update" on public.organizations
  for update using (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]));
create policy "organizations: owners delete" on public.organizations
  for delete using (public.has_org_role(id, array['owner']::public.organization_role[]));
-- INSERT goes through create_organization() so the creator becomes owner atomically.

alter table public.organization_members enable row level security;
create policy "members: read same org" on public.organization_members
  for select using (public.is_org_member(organization_id));
create policy "members: admins manage" on public.organization_members
  for all using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

-- Tenant tables: members read, editors write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'business_profiles', 'locations', 'target_audiences', 'personas', 'services',
    'competitors', 'brand_assets', 'social_accounts', 'posts', 'post_schedules', 'campaigns',
    'ad_sets', 'creatives', 'ads', 'metrics', 'ai_recommendations', 'ai_conversations', 'ai_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id))',
      t || ': members read', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.can_edit_org(organization_id))',
      t || ': editors insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id))',
      t || ': editors update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.can_edit_org(organization_id))',
      t || ': editors delete', t
    );
  end loop;
end;
$$;

-- Child rows must point at a parent inside the same organization. RLS alone
-- would let an editor of org A attach a row to a brand of org B by id, so
-- enforce it with a trigger.
create or replace function public.assert_same_org_brand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id is not null and not exists (
    select 1 from public.brands b where b.id = new.brand_id and b.organization_id = new.organization_id
  ) then
    raise exception 'brand % does not belong to organization %', new.brand_id, new.organization_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'business_profiles', 'locations', 'target_audiences', 'personas', 'services', 'competitors',
    'brand_assets', 'social_accounts', 'posts', 'campaigns', 'creatives', 'ai_recommendations',
    'ai_conversations'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.assert_same_org_brand()',
      t || '_same_org_brand', t
    );
  end loop;
end;
$$;

create or replace function public.assert_same_org_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_org uuid;
begin
  if tg_table_name = 'post_schedules' then
    select organization_id into parent_org from public.posts where id = new.post_id;
  elsif tg_table_name = 'ai_messages' then
    select organization_id into parent_org from public.ai_conversations where id = new.conversation_id;
  elsif tg_table_name = 'ad_sets' then
    select organization_id into parent_org from public.campaigns where id = new.campaign_id;
  elsif tg_table_name = 'ads' then
    select organization_id into parent_org from public.ad_sets where id = new.ad_set_id;
  end if;
  if parent_org is distinct from new.organization_id then
    raise exception 'parent row does not belong to organization %', new.organization_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger post_schedules_same_org before insert or update on public.post_schedules
  for each row execute function public.assert_same_org_parent();
create trigger ai_messages_same_org before insert or update on public.ai_messages
  for each row execute function public.assert_same_org_parent();
create trigger ad_sets_same_org before insert or update on public.ad_sets
  for each row execute function public.assert_same_org_parent();
create trigger ads_same_org before insert or update on public.ads
  for each row execute function public.assert_same_org_parent();

-- ---------------------------------------------------------------------
-- Auth hook: create a profile for every new user
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RPC: create an organization (+ owner membership + empty brand)
-- ---------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_is_demo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_brand uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'organization name is required' using errcode = '22023';
  end if;

  insert into public.organizations (name, is_demo, created_by)
  values (btrim(p_name), coalesce(p_is_demo, false), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.brands (organization_id, name)
  values (v_org, btrim(p_name))
  returning id into v_brand;

  insert into public.business_profiles (organization_id, brand_id, company_name)
  values (v_org, v_brand, btrim(p_name));

  insert into public.target_audiences (organization_id, brand_id)
  values (v_org, v_brand);

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, boolean) from public;
grant execute on function public.create_organization(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: save the whole Brand Brain atomically.
-- SECURITY INVOKER: every statement is checked by RLS for the caller.
-- ---------------------------------------------------------------------
create or replace function public.save_brand_brain(p_brand_id uuid, p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_audience uuid;
  v_item jsonb;
  v_idx int;
  v_keep uuid[] := '{}';
  v_location_id uuid;
  v_platform text;
begin
  select organization_id into v_org from public.brands where id = p_brand_id;
  if v_org is null or not public.can_edit_org(v_org) then
    raise exception 'brand not found or not editable' using errcode = '42501';
  end if;

  update public.brands set
    name = coalesce(p ->> 'brandName', name),
    industry_key = coalesce(p #>> '{industry,key}', industry_key),
    industry_label = coalesce(p #>> '{industry,label}', industry_label),
    business_description = coalesce(p ->> 'businessDescription', business_description),
    website = coalesce(p ->> 'website', website),
    service_description = coalesce(p ->> 'serviceDescription', service_description),
    brand_personality = coalesce(array(select jsonb_array_elements_text(p -> 'brandPersonality')), brand_personality),
    brand_tone = coalesce(array(select jsonb_array_elements_text(p -> 'brandTone')), brand_tone),
    writing_tone = coalesce(p ->> 'writingTone', writing_tone),
    ai_context = coalesce(p ->> 'aiContext', ai_context),
    onboarding_step = greatest(onboarding_step, coalesce((p ->> 'onboardingStep')::smallint, 0)),
    onboarding_completed_at = case
      when (p ->> 'completeOnboarding')::boolean then coalesce(onboarding_completed_at, now())
      else onboarding_completed_at end
  where id = p_brand_id;

  insert into public.business_profiles as bp (
    organization_id, brand_id, company_name, strengths, features, differentiators,
    marketing_goals, social_goals, advertising_goals
  ) values (
    v_org, p_brand_id,
    coalesce(p ->> 'companyName', ''),
    array(select jsonb_array_elements_text(coalesce(p -> 'strengths', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p -> 'features', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p -> 'differentiators', '[]'))),
    coalesce(p ->> 'marketingGoals', ''),
    coalesce(p ->> 'socialGoals', ''),
    coalesce(p ->> 'advertisingGoals', '')
  )
  on conflict (brand_id) do update set
    company_name = excluded.company_name,
    strengths = excluded.strengths,
    features = excluded.features,
    differentiators = excluded.differentiators,
    marketing_goals = excluded.marketing_goals,
    social_goals = excluded.social_goals,
    advertising_goals = excluded.advertising_goals;

  -- Primary target audience
  select id into v_audience from public.target_audiences
  where brand_id = p_brand_id and is_primary order by created_at limit 1;
  if v_audience is null then
    insert into public.target_audiences (organization_id, brand_id) values (v_org, p_brand_id)
    returning id into v_audience;
  end if;
  update public.target_audiences set
    summary = coalesce(p #>> '{targetAudience,summary}', ''),
    age_range = coalesce(p #>> '{targetAudience,ageRange}', ''),
    gender = coalesce(p #>> '{targetAudience,gender}', ''),
    occupation = coalesce(p #>> '{targetAudience,occupation}', ''),
    pain_points = array(select jsonb_array_elements_text(coalesce(p #> '{targetAudience,painPoints}', '[]'))),
    use_cases = array(select jsonb_array_elements_text(coalesce(p #> '{targetAudience,useCases}', '[]')))
  where id = v_audience;

  -- Replace list children (small lists, order matters)
  delete from public.personas where brand_id = p_brand_id;
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'personas', '[]')) loop
    insert into public.personas (organization_id, brand_id, target_audience_id, name, description, sort_order)
    values (v_org, p_brand_id, v_audience, v_item ->> 'name', coalesce(v_item ->> 'description', ''), v_idx);
    v_idx := v_idx + 1;
  end loop;

  delete from public.services where brand_id = p_brand_id;
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'services', '[]')) loop
    insert into public.services (organization_id, brand_id, name, description, price, sort_order)
    values (
      v_org, p_brand_id, v_item ->> 'name', coalesce(v_item ->> 'description', ''),
      nullif(v_item ->> 'price', '')::numeric, v_idx
    );
    v_idx := v_idx + 1;
  end loop;

  delete from public.competitors where brand_id = p_brand_id;
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'competitors', '[]')) loop
    insert into public.competitors (organization_id, brand_id, name, note, sort_order)
    values (v_org, p_brand_id, v_item ->> 'name', coalesce(v_item ->> 'note', ''), v_idx);
    v_idx := v_idx + 1;
  end loop;

  -- Locations keep their ids (posts / campaigns reference them)
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'locations', '[]')) loop
    v_location_id := nullif(v_item ->> 'id', '')::uuid;
    if v_location_id is not null and exists (
      select 1 from public.locations where id = v_location_id and brand_id = p_brand_id
    ) then
      update public.locations set
        name = v_item ->> 'name',
        address = coalesce(v_item ->> 'address', ''),
        is_primary = (v_idx = 0),
        sort_order = v_idx
      where id = v_location_id;
    else
      insert into public.locations (organization_id, brand_id, name, address, is_primary, sort_order)
      values (v_org, p_brand_id, v_item ->> 'name', coalesce(v_item ->> 'address', ''), v_idx = 0, v_idx)
      returning id into v_location_id;
    end if;
    v_keep := v_keep || v_location_id;
    v_idx := v_idx + 1;
  end loop;
  delete from public.locations where brand_id = p_brand_id and not (id = any (v_keep));

  -- Social handles (manual entries; OAuth connections are kept)
  for v_platform in select unnest(array['instagram', 'threads', 'tiktok', 'facebook']) loop
    if coalesce(p #>> array['social', v_platform], '') = '' then
      delete from public.social_accounts
      where brand_id = p_brand_id and platform = v_platform::public.social_platform and connection_status = 'manual';
    else
      insert into public.social_accounts (organization_id, brand_id, platform, handle)
      values (v_org, p_brand_id, v_platform::public.social_platform, p #>> array['social', v_platform])
      on conflict (brand_id, platform) do update set handle = excluded.handle;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_brand_brain(uuid, jsonb) from public;
grant execute on function public.save_brand_brain(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Grants (Supabase roles). RLS still applies to every statement.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
