-- Account / location / HQ isolation tests (run after rls_test.sql setup):
--   cat auth_stub.sql ../migrations/*.sql rls_accounts_test.sql | psql
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');
set role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.create_organization('Org A') as org_a \gset
select id as brand_a from public.brands where organization_id = :'org_a' \gset
select public.save_brand_brain(:'brand_a', '{"brandName":"A","companyName":"A","industry":{"key":"seitai","label":"整体"},
  "locations":[{"name":"渋谷院"},{"name":"新宿院"}],"social":{"instagram":"@a_hq","threads":"@a_th"}}'::jsonb);
select id as loc_a from public.locations where name = '渋谷院' \gset

do $$ begin
  assert (select count(*) from public.social_accounts where is_brand_default) = 2, 'brand default accounts synced';
end $$;

-- several accounts per platform (location + recruiting)
insert into public.social_accounts (organization_id, brand_id, location_id, platform, handle, goal, display_name)
values (:'org_a', :'brand_a', :'loc_a', 'instagram', '@a_shibuya', 'acquisition', '渋谷院')
returning id as acc_a \gset
insert into public.social_accounts (organization_id, brand_id, platform, handle, goal)
values (:'org_a', :'brand_a', 'instagram', '@a_recruit', 'recruitment');
insert into public.account_strategies (organization_id, social_account_id, persona, kpis, content_pillars, posts_per_week, cta, tone)
values (:'org_a', :'acc_a', '30代女性', '{新規予約数}', '{How-to,スタッフ紹介}', 4, 'LINE予約', 'やさしく');
insert into public.location_profiles (organization_id, location_id, area, local_keywords) values (:'org_a', :'loc_a', '渋谷', '{#渋谷整体}');
insert into public.location_staff (organization_id, location_id, name, role) values (:'org_a', :'loc_a', '田中', '院長');
insert into public.hq_campaigns (organization_id, brand_id, name, localization_rules, target_location_ids)
values (:'org_a', :'brand_a', '秋キャンペーン', '{地域名を入れる}', array[:'loc_a']::uuid[]) returning id as camp_a \gset
insert into public.posts (organization_id, brand_id, platform, title, social_account_id, hq_campaign_id, location_id, source)
values (:'org_a', :'brand_a', 'instagram', 'localized', :'acc_a', :'camp_a', :'loc_a', 'hq_localization');

-- re-saving the Brand Brain keeps non-default accounts and strategies
select public.save_brand_brain(:'brand_a', jsonb_build_object('brandName','A','companyName','A','industry','{"key":"seitai","label":"整体"}'::jsonb,
  'locations', (select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.locations), 'social','{"instagram":"@a_hq2"}'::jsonb));
do $$ begin
  assert (select count(*) from public.social_accounts) = 3, 'threads default removed, others kept';
  assert (select handle from public.social_accounts where is_brand_default) = '@a_hq2', 'default handle updated';
  assert (select count(*) from public.account_strategies) = 1, 'strategy kept';
end $$;

-- User B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select public.create_organization('Org B') as org_b \gset
select id as brand_b from public.brands where organization_id = :'org_b' \gset
do $$ begin
  assert (select count(*) from public.social_accounts) = 0, 'B cannot read A accounts';
  assert (select count(*) from public.account_strategies) = 0, 'B cannot read A strategies';
  assert (select count(*) from public.location_profiles) = 0, 'B cannot read A profiles';
  assert (select count(*) from public.location_staff) = 0, 'B cannot read A staff';
  assert (select count(*) from public.hq_campaigns) = 0, 'B cannot read A campaigns';
end $$;
\set ON_ERROR_STOP 0
-- B attaching its own rows to A's location / account / targets must fail
insert into public.location_profiles (organization_id, location_id, area) values (:'org_b', :'loc_a', 'x');
insert into public.account_strategies (organization_id, social_account_id) values (:'org_b', :'acc_a');
insert into public.hq_campaigns (organization_id, name, target_location_ids) values (:'org_b', 'x', array[:'loc_a']::uuid[]);
insert into public.posts (organization_id, platform, title, social_account_id) values (:'org_b', 'instagram', 'x', :'acc_a');
update public.location_profiles set area = 'hacked';
\set ON_ERROR_STOP 1

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  assert (select area from public.location_profiles) = '渋谷', 'A profile untouched';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.location_profiles) = 1, 'no cross-tenant profile rows';
  assert (select count(*) from public.account_strategies) = 1, 'no cross-tenant strategy rows';
  assert (select count(*) from public.hq_campaigns) = 2 - 1, 'no cross-tenant campaigns';
end $$;
select 'ACCOUNT/HQ RLS TESTS PASSED' as result;
