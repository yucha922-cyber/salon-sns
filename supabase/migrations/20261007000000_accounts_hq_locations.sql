-- =====================================================================
-- Account strategy, HQ templates and location customization
--
--   social_accounts      → now many per platform (HQ / per location / recruiting),
--                          each with a goal: acquisition | recruitment | branding
--   account_strategies   → persona, KPI, content pillars, frequency, CTA, tone
--   location_profiles    → area, demographics, featured services, offers, keywords
--   location_staff       → staff per location
--   hq_campaigns         → HQ campaign + shared theme/creative + localization rules
--   posts                → linked to account / HQ campaign
-- =====================================================================

-- ---------------------------------------------------------------------
-- social_accounts: allow several accounts per platform
-- ---------------------------------------------------------------------
alter table public.social_accounts drop constraint if exists social_accounts_brand_id_platform_key;

-- Rows created from the Brand Brain "SNS" section are the brand defaults.
alter table public.social_accounts add column is_brand_default boolean not null default true;
alter table public.social_accounts alter column is_brand_default set default false;
alter table public.social_accounts add column display_name text not null default '';
alter table public.social_accounts add column goal text not null default 'acquisition'
  check (goal in ('acquisition', 'recruitment', 'branding'));

create unique index social_accounts_brand_default_uniq
  on public.social_accounts (brand_id, platform) where is_brand_default;
create index social_accounts_org_idx on public.social_accounts (organization_id);

create table public.account_strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  social_account_id uuid not null unique references public.social_accounts (id) on delete cascade,
  persona text not null default '',
  kpis text[] not null default '{}',
  content_pillars text[] not null default '{}',
  posts_per_week smallint not null default 3 check (posts_per_week between 0 and 50),
  posting_frequency_note text not null default '',
  cta text not null default '',
  tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Location customization
-- ---------------------------------------------------------------------
create table public.location_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null unique references public.locations (id) on delete cascade,
  area text not null default '',
  demographics text not null default '',
  featured_services text[] not null default '{}',
  offers text[] not null default '{}',
  local_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.location_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  role text not null default '',
  specialty text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index location_staff_location_idx on public.location_staff (location_id);

-- ---------------------------------------------------------------------
-- HQ templates
-- ---------------------------------------------------------------------
create table public.hq_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  starts_on date,
  ends_on date,
  shared_theme text not null default '',
  creative_headline text not null default '',
  creative_body text not null default '',
  creative_visual text not null default '',
  localization_rules text[] not null default '{}',
  -- empty = all locations
  target_location_ids uuid[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index hq_campaigns_org_idx on public.hq_campaigns (organization_id, created_at desc);

alter table public.posts add column social_account_id uuid references public.social_accounts (id) on delete set null;
alter table public.posts add column hq_campaign_id uuid references public.hq_campaigns (id) on delete set null;
alter table public.posts drop constraint if exists posts_source_check;
alter table public.posts add constraint posts_source_check
  check (source in ('manual', 'ai_post_creator', 'ai_planner', 'hq_localization', 'demo'));

-- ---------------------------------------------------------------------
-- updated_at + RLS + same-organization guards
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['account_strategies', 'location_profiles', 'location_staff', 'hq_campaigns'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || ': members read', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_org(organization_id))', t || ': editors insert', t);
    execute format(
      'create policy %I on public.%I for update using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id))',
      t || ': editors update', t
    );
    execute format('create policy %I on public.%I for delete using (public.can_edit_org(organization_id))', t || ': editors delete', t);
  end loop;
end;
$$;

create trigger hq_campaigns_same_org_brand before insert or update on public.hq_campaigns
  for each row execute function public.assert_same_org_brand();

-- Every referenced parent (location / account / campaign) must be in the same organization.
create or replace function public.assert_same_org_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_ref uuid;
begin
  v_ref := nullif(v_row ->> 'location_id', '')::uuid;
  if v_ref is not null and not exists (
    select 1 from public.locations where id = v_ref and organization_id = new.organization_id
  ) then
    raise exception 'location does not belong to organization' using errcode = '42501';
  end if;
  v_ref := nullif(v_row ->> 'social_account_id', '')::uuid;
  if v_ref is not null and not exists (
    select 1 from public.social_accounts where id = v_ref and organization_id = new.organization_id
  ) then
    raise exception 'account does not belong to organization' using errcode = '42501';
  end if;
  v_ref := nullif(v_row ->> 'hq_campaign_id', '')::uuid;
  if v_ref is not null and not exists (
    select 1 from public.hq_campaigns where id = v_ref and organization_id = new.organization_id
  ) then
    raise exception 'campaign does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['social_accounts', 'account_strategies', 'location_profiles', 'location_staff', 'posts'] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.assert_same_org_refs()',
      t || '_same_org_refs', t
    );
  end loop;
end;
$$;

-- HQ campaigns may only target the organization's own locations.
create or replace function public.assert_hq_targets_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(new.target_location_ids) as t(id)
    where not exists (select 1 from public.locations l where l.id = t.id and l.organization_id = new.organization_id)
  ) then
    raise exception 'target location does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger hq_campaigns_targets_same_org before insert or update on public.hq_campaigns
  for each row execute function public.assert_hq_targets_same_org();

grant select, insert, update, delete on
  public.account_strategies, public.location_profiles, public.location_staff, public.hq_campaigns
  to authenticated;

-- ---------------------------------------------------------------------
-- save_brand_brain: social handles now map to the brand-default accounts
-- (only the social section changes; the rest is identical to the original)
-- ---------------------------------------------------------------------
create or replace function public.sync_brand_default_accounts(p_brand_id uuid, p_social jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_platform text;
  v_handle text;
begin
  select organization_id into v_org from public.brands where id = p_brand_id;
  for v_platform in select unnest(array['instagram', 'threads', 'tiktok', 'facebook']) loop
    v_handle := coalesce(p_social ->> v_platform, '');
    if v_handle = '' then
      delete from public.social_accounts
      where brand_id = p_brand_id and platform = v_platform::public.social_platform
        and is_brand_default and connection_status = 'manual';
    else
      insert into public.social_accounts (organization_id, brand_id, platform, handle, is_brand_default, goal)
      values (v_org, p_brand_id, v_platform::public.social_platform, v_handle, true, 'branding')
      on conflict (brand_id, platform) where is_brand_default do update set handle = excluded.handle;
    end if;
  end loop;
end;
$$;
revoke all on function public.sync_brand_default_accounts(uuid, jsonb) from public;
grant execute on function public.sync_brand_default_accounts(uuid, jsonb) to authenticated;

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

  -- Social handles → brand-default accounts
  perform public.sync_brand_default_accounts(p_brand_id, coalesce(p -> 'social', '{}'::jsonb));
end;
$$;
