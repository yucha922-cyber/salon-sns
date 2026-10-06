-- =====================================================================
-- SNS operations loop: account strategy v2, content pillar library,
-- HQ campaigns v2, AI monthly plan proposals (human-in-the-loop),
-- planning fields on posts, AI recommendations v2.
--
-- Design notes
--   * Existing tables are extended instead of duplicated:
--       social_accounts + account_strategies  = SocialAccount strategy
--       hq_campaigns                          = organization campaigns / content themes
--       posts                                 = SNS Planner items (approved plan items land here)
--   * Campaign targets stay as validated arrays (target_location_ids,
--     target_platforms) rather than join tables.
--   * AI plans are stored as proposals first; only approved items become posts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Social account strategy v2
-- ---------------------------------------------------------------------
alter table public.social_accounts drop constraint if exists social_accounts_goal_check;
alter table public.social_accounts add constraint social_accounts_goal_check
  check (goal in ('acquisition', 'recruitment', 'branding', 'engagement', 'retention', 'custom'));
alter table public.social_accounts add column custom_goal text not null default '';
alter table public.social_accounts add column active boolean not null default true;

alter table public.account_strategies add column target_audience text not null default '';
-- [{ "metric": "予約数", "target": 40, "unit": "件/月" }, ...]
alter table public.account_strategies add column kpi_targets jsonb not null default '[]'::jsonb
  check (jsonb_typeof(kpi_targets) = 'array');
-- 0 = Sunday … 6 = Saturday
alter table public.account_strategies add column preferred_posting_days smallint[] not null default '{}'
  check (preferred_posting_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);
-- 'HH:MM' in the organization's timezone (Asia/Tokyo)
alter table public.account_strategies add column preferred_posting_times text[] not null default '{}';
alter table public.account_strategies add column notes text not null default '';

-- Legacy free-text KPIs become kpi_targets without a numeric target.
update public.account_strategies
set kpi_targets = coalesce(
  (select jsonb_agg(jsonb_build_object('metric', k, 'target', null, 'unit', '')) from unnest(kpis) as k),
  '[]'::jsonb
)
where kpi_targets = '[]'::jsonb and cardinality(kpis) > 0;

-- ---------------------------------------------------------------------
-- 2. Content pillar library
--    organization_id null = system preset (read-only for everyone)
-- ---------------------------------------------------------------------
create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  goal text not null check (goal in ('acquisition', 'recruitment', 'branding', 'engagement', 'retention', 'custom')),
  key text not null check (key ~ '^[a-z0-9_]{1,64}$'),
  label text not null check (char_length(label) between 1 and 60),
  description text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index content_pillars_system_key on public.content_pillars (key) where organization_id is null;
create unique index content_pillars_org_key on public.content_pillars (organization_id, key) where organization_id is not null;

insert into public.content_pillars (organization_id, goal, key, label, description, sort_order) values
  (null, 'acquisition', 'education', '教育・専門知識', '体の仕組みや施術の考え方をわかりやすく伝える', 1),
  (null, 'acquisition', 'problem_awareness', 'お悩み共感', 'ターゲットの悩みを言語化して気づきを与える', 2),
  (null, 'acquisition', 'before_after', 'Before / After', '変化を誇張せず、事実として見せる（許諾済み）', 3),
  (null, 'acquisition', 'testimonial', 'お客様の声', '許諾を得た口コミ・体験談', 4),
  (null, 'acquisition', 'staff_expertise', 'スタッフの専門性', '資格・得意分野・施術へのこだわり', 5),
  (null, 'acquisition', 'selfcare', 'セルフケア', '今日からできるケアで保存を促す', 6),
  (null, 'acquisition', 'offer', 'オファー・キャンペーン', '初回特典・期間限定の案内', 7),
  (null, 'acquisition', 'faq', 'よくある質問', '来店前の不安を解消する', 8),
  (null, 'recruitment', 'staff_story', 'スタッフストーリー', 'この仕事を選んだ理由・成長の物語', 1),
  (null, 'recruitment', 'culture', 'カルチャー', 'チームの雰囲気・価値観', 2),
  (null, 'recruitment', 'career', 'キャリアパス', '昇格・独立・専門性の伸ばし方', 3),
  (null, 'recruitment', 'training', '研修・教育', '入社後の研修制度と技術習得', 4),
  (null, 'recruitment', 'day_in_the_life', '1日の仕事', '出勤から退勤までのリアル', 5),
  (null, 'recruitment', 'benefits', '給与・福利厚生', '待遇・休日・働きやすさ', 6),
  (null, 'recruitment', 'vision', 'ビジョン', '代表・本部が目指す未来', 7),
  (null, 'recruitment', 'employee_voice', '社員の声', '現場スタッフのインタビュー', 8),
  (null, 'branding', 'brand_story', 'ブランドストーリー', '創業の想いと大切にしていること', 1),
  (null, 'branding', 'expertise_column', '専門コラム', 'ブランドとしての専門的な見解', 2),
  (null, 'branding', 'network', '店舗ネットワーク', '各店舗の紹介とつながり', 3),
  (null, 'engagement', 'quiz', 'クイズ・アンケート', '参加型で会話を生む', 1),
  (null, 'engagement', 'behind_the_scenes', '舞台裏', '日常の裏側で親近感をつくる', 2),
  (null, 'retention', 'aftercare', 'アフターケア', '来店後のセルフケアと再来店のきっかけ', 1),
  (null, 'retention', 'member_info', '会員・回数券情報', '継続利用のメリット', 2);

-- ---------------------------------------------------------------------
-- 3. HQ campaigns v2 (organization campaign / content theme)
-- ---------------------------------------------------------------------
alter table public.hq_campaigns drop constraint if exists hq_campaigns_status_check;
update public.hq_campaigns set status = 'completed' where status = 'ended';
alter table public.hq_campaigns add constraint hq_campaigns_status_check
  check (status in ('draft', 'active', 'completed', 'archived'));
alter table public.hq_campaigns add column goal text not null default 'acquisition'
  check (goal in ('acquisition', 'recruitment', 'branding', 'engagement', 'retention', 'custom'));
alter table public.hq_campaigns add column target_platforms text[] not null default '{}'
  check (target_platforms <@ array['instagram', 'threads', 'tiktok', 'facebook']);
alter table public.hq_campaigns add column content_directions text[] not null default '{}';
alter table public.hq_campaigns add column required_messages text[] not null default '{}';
alter table public.hq_campaigns add column optional_messages text[] not null default '{}';
alter table public.hq_campaigns add column cta text not null default '';

-- ---------------------------------------------------------------------
-- 4. Planning fields on posts (SNS Planner items)
-- ---------------------------------------------------------------------
alter table public.posts add column theme text not null default '';
alter table public.posts add column hook text not null default '';
alter table public.posts add column summary text not null default '';
alter table public.posts add column goal text;
alter table public.posts add column target text not null default '';
alter table public.posts add column content_pillar text not null default '';
alter table public.posts add column funnel_stage text not null default '';
alter table public.posts add column plan_proposal_item_id uuid;
alter table public.posts drop constraint if exists posts_source_check;
alter table public.posts add constraint posts_source_check
  check (source in ('manual', 'ai_post_creator', 'ai_planner', 'hq_localization', 'demo'));

-- ---------------------------------------------------------------------
-- 5. AI plan proposals (nothing reaches the planner before approval)
-- ---------------------------------------------------------------------
create table public.ai_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  hq_campaign_id uuid references public.hq_campaigns (id) on delete set null,
  month date not null check (extract(day from month) = 1),
  goal text not null,
  summary text not null default '',
  ai_provider text,
  status text not null default 'pending' check (status in ('pending', 'partially_approved', 'approved', 'rejected')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_plan_proposals_org_idx on public.ai_plan_proposals (organization_id, created_at desc);

create table public.ai_plan_proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  proposal_id uuid not null references public.ai_plan_proposals (id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  platform public.social_platform not null,
  content_type text not null,
  theme text not null,
  hook text not null default '',
  summary text not null default '',
  goal text not null,
  target text not null default '',
  content_pillar text not null default '',
  funnel_stage text not null default '',
  cta text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  post_id uuid references public.posts (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_plan_proposal_items_proposal_idx on public.ai_plan_proposal_items (proposal_id, sort_order);

alter table public.posts add constraint posts_plan_proposal_item_fk
  foreign key (plan_proposal_item_id) references public.ai_plan_proposal_items (id) on delete set null;

-- ---------------------------------------------------------------------
-- 6. AI recommendations v2
-- ---------------------------------------------------------------------
alter table public.ai_recommendations drop constraint if exists ai_recommendations_status_check;
update public.ai_recommendations set status = case status
  when 'draft' then 'pending'
  when 'pending_approval' then 'pending'
  when 'dismissed' then 'rejected'
  when 'applied' then 'completed'
  else status end;
alter table public.ai_recommendations alter column status set default 'pending';
alter table public.ai_recommendations add constraint ai_recommendations_status_check
  check (status in ('pending', 'approved', 'rejected', 'completed'));

alter table public.ai_recommendations rename column kind to category;
update public.ai_recommendations set category = 'strategy'
  where category not in ('social', 'ads', 'creative', 'strategy', 'recruitment', 'acquisition');
alter table public.ai_recommendations add constraint ai_recommendations_category_check
  check (category in ('social', 'ads', 'creative', 'strategy', 'recruitment', 'acquisition'));
alter table public.ai_recommendations rename column proposal to recommended_action;
alter table public.ai_recommendations rename column impact to expected_impact;
alter table public.ai_recommendations alter column expected_impact set default '';
update public.ai_recommendations set expected_impact = '' where expected_impact is null;
alter table public.ai_recommendations alter column expected_impact set not null;
alter table public.ai_recommendations add column location_id uuid references public.locations (id) on delete set null;
alter table public.ai_recommendations add column social_account_id uuid references public.social_accounts (id) on delete set null;
alter table public.ai_recommendations add column severity text not null default 'medium'
  check (severity in ('low', 'medium', 'high'));
alter table public.ai_recommendations add column insight text not null default '';
alter table public.ai_recommendations add column confidence numeric(3, 2) not null default 0.5
  check (confidence between 0 and 1);
alter table public.ai_recommendations add column decided_by uuid references auth.users (id) on delete set null;
alter table public.ai_recommendations add column decided_at timestamptz;
create index ai_recommendations_org_idx on public.ai_recommendations (organization_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- 7. Triggers, RLS, same-organization guards
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['content_pillars', 'ai_plan_proposals', 'ai_plan_proposal_items'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['ai_plan_proposals', 'ai_plan_proposal_items'] loop
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

-- System presets are readable by every signed-in user; custom pillars only by members.
create policy "content_pillars: read" on public.content_pillars
  for select using (organization_id is null or public.is_org_member(organization_id));
create policy "content_pillars: editors insert" on public.content_pillars
  for insert with check (organization_id is not null and public.can_edit_org(organization_id));
create policy "content_pillars: editors update" on public.content_pillars
  for update using (organization_id is not null and public.can_edit_org(organization_id))
  with check (organization_id is not null and public.can_edit_org(organization_id));
create policy "content_pillars: editors delete" on public.content_pillars
  for delete using (organization_id is not null and public.can_edit_org(organization_id));

-- References (location / account / campaign) must stay inside the organization.
create trigger ai_plan_proposals_same_org_refs before insert or update on public.ai_plan_proposals
  for each row execute function public.assert_same_org_refs();
create trigger ai_recommendations_same_org_refs before insert or update on public.ai_recommendations
  for each row execute function public.assert_same_org_refs();

create or replace function public.assert_proposal_item_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.ai_plan_proposals p where p.id = new.proposal_id and p.organization_id = new.organization_id
  ) then
    raise exception 'proposal does not belong to organization' using errcode = '42501';
  end if;
  if new.post_id is not null and not exists (
    select 1 from public.posts p where p.id = new.post_id and p.organization_id = new.organization_id
  ) then
    raise exception 'post does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger ai_plan_proposal_items_same_org before insert or update on public.ai_plan_proposal_items
  for each row execute function public.assert_proposal_item_same_org();

create or replace function public.assert_post_plan_item_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_proposal_item_id is not null and not exists (
    select 1 from public.ai_plan_proposal_items i
    where i.id = new.plan_proposal_item_id and i.organization_id = new.organization_id
  ) then
    raise exception 'plan item does not belong to organization' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_plan_item_same_org before insert or update on public.posts
  for each row execute function public.assert_post_plan_item_same_org();

grant select, insert, update, delete on
  public.content_pillars, public.ai_plan_proposals, public.ai_plan_proposal_items
  to authenticated;
