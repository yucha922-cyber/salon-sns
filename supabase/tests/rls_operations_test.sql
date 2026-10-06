-- Operations loop (pillars / proposals / recommendations / campaigns v2) isolation tests:
--   cat auth_stub.sql ../migrations/*.sql rls_operations_test.sql | psql
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');
set role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
select public.create_organization('Org A') as org_a \gset
select id as brand_a from public.brands where organization_id = :'org_a' \gset
select public.save_brand_brain(:'brand_a', '{"brandName":"A","companyName":"A","industry":{"key":"seitai","label":"整体"},"locations":[{"name":"渋谷院"}]}'::jsonb);
select id as loc_a from public.locations limit 1 \gset
insert into public.social_accounts (organization_id, brand_id, location_id, platform, handle, goal, custom_goal)
values (:'org_a', :'brand_a', :'loc_a', 'threads', '@a', 'engagement', '') returning id as acc_a \gset
insert into public.account_strategies (organization_id, social_account_id, kpi_targets, preferred_posting_days, preferred_posting_times)
values (:'org_a', :'acc_a', '[{"metric":"予約数","target":40,"unit":"件"}]', '{1,3,5}', '{12:00,20:00}');
insert into public.content_pillars (organization_id, goal, key, label) values (:'org_a', 'acquisition', 'custom_shibuya_walk', '渋谷さんぽ');
insert into public.hq_campaigns (organization_id, brand_id, name, status, goal, target_platforms, required_messages)
values (:'org_a', :'brand_a', '10月テーマ', 'active', 'acquisition', '{instagram,threads}', '{初回姿勢チェック無料}') returning id as camp_a \gset
insert into public.ai_plan_proposals (organization_id, social_account_id, location_id, hq_campaign_id, month, goal)
values (:'org_a', :'acc_a', :'loc_a', :'camp_a', '2026-11-01', 'acquisition') returning id as prop_a \gset
insert into public.ai_plan_proposal_items (organization_id, proposal_id, scheduled_date, scheduled_time, platform, content_type, theme, goal)
values (:'org_a', :'prop_a', '2026-11-02', '20:00', 'threads', 'threads_text', '肩こり', 'acquisition') returning id as item_a \gset
insert into public.posts (organization_id, platform, title, social_account_id, plan_proposal_item_id, theme, hook, funnel_stage, source)
values (:'org_a', 'threads', 'p', :'acc_a', :'item_a', '肩こり', 'hook', '悩み', 'ai_planner') returning id as post_a \gset
update public.ai_plan_proposal_items set status = 'approved', post_id = :'post_a' where id = :'item_a';
insert into public.ai_recommendations (organization_id, brand_id, location_id, social_account_id, category, title, severity, insight, recommended_action, confidence)
values (:'org_a', :'brand_a', :'loc_a', :'acc_a', 'acquisition', '投稿不足', 'high', 'i', 'a', 0.8);

do $$ begin
  assert (select count(*) from public.content_pillars where organization_id is null) >= 16, 'system pillars visible';
  assert (select count(*) from public.content_pillars where organization_id is not null) = 1, 'own custom pillar visible';
end $$;

-- invalid values are rejected by constraints
\set ON_ERROR_STOP 0
insert into public.social_accounts (organization_id, brand_id, platform, handle, goal) values (:'org_a', :'brand_a', 'instagram', '@x', 'sales');
insert into public.account_strategies (organization_id, social_account_id, preferred_posting_days) values (:'org_a', :'acc_a', '{9}');
insert into public.ai_plan_proposals (organization_id, social_account_id, month, goal) values (:'org_a', :'acc_a', '2026-11-15', 'acquisition');
insert into public.content_pillars (organization_id, goal, key, label) values (null, 'acquisition', 'hijack', 'x');
\set ON_ERROR_STOP 1

-- User B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
select public.create_organization('Org B') as org_b \gset
select id as brand_b from public.brands where organization_id = :'org_b' \gset
insert into public.social_accounts (organization_id, brand_id, platform, handle) values (:'org_b', :'brand_b', 'instagram', '@b') returning id as acc_b \gset
do $$ begin
  assert (select count(*) from public.content_pillars where organization_id is not null) = 0, 'B cannot read A pillars';
  assert (select count(*) from public.content_pillars where organization_id is null) >= 16, 'B reads system pillars';
  assert (select count(*) from public.ai_plan_proposals) = 0, 'B cannot read A proposals';
  assert (select count(*) from public.ai_plan_proposal_items) = 0, 'B cannot read A items';
  assert (select count(*) from public.ai_recommendations) = 0, 'B cannot read A recommendations';
end $$;
\set ON_ERROR_STOP 0
insert into public.ai_plan_proposals (organization_id, social_account_id, month, goal) values (:'org_b', :'acc_a', '2026-11-01', 'acquisition');
insert into public.ai_plan_proposal_items (organization_id, proposal_id, scheduled_date, scheduled_time, platform, content_type, theme, goal)
  values (:'org_b', :'prop_a', '2026-11-02', '20:00', 'threads', 'x', 'x', 'x');
insert into public.ai_recommendations (organization_id, category, title, social_account_id) values (:'org_b', 'social', 'x', :'acc_a');
insert into public.posts (organization_id, platform, title, plan_proposal_item_id) values (:'org_b', 'instagram', 'x', :'item_a');
update public.content_pillars set label = 'hacked';
update public.ai_recommendations set status = 'approved';
\set ON_ERROR_STOP 1

reset role;
do $$ begin
  assert (select count(*) from public.ai_plan_proposals) = 1, 'no cross-tenant proposals';
  assert (select count(*) from public.ai_plan_proposal_items) = 1, 'no cross-tenant items';
  assert (select count(*) from public.ai_recommendations) = 1, 'no cross-tenant recommendations';
  assert (select status from public.ai_recommendations) = 'pending', 'B could not approve A recommendation';
  assert (select count(*) from public.content_pillars where label = 'hacked') = 0, 'pillars untouched';
  assert (select count(*) from public.posts where plan_proposal_item_id is not null) = 1, 'no cross-tenant plan links';
end $$;
select 'OPERATIONS RLS TESTS PASSED' as result;
