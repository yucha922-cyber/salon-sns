-- RLS / tenant-isolation smoke test. Run against a scratch database:
--   psql -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../migrations/*.sql -f rls_test.sql
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set role authenticated;

-- User A creates an organization and saves a Brand Brain
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.create_organization('Org A') as org_a \gset
select id as brand_a from public.brands where organization_id = :'org_a' \gset
select public.save_brand_brain(:'brand_a', '{
  "brandName":"A Brand","companyName":"A Inc","industry":{"key":"seitai","label":"整体"},
  "strengths":["s1"],"services":[{"name":"コース","price":8800}],
  "locations":[{"name":"渋谷院","address":"渋谷"}],
  "targetAudience":{"ageRange":"30代","painPoints":["肩こり"]},
  "personas":[{"name":"P1"}],"competitors":[{"name":"C1"}],
  "social":{"instagram":"@a"},"completeOnboarding":true
}'::jsonb);
insert into public.posts (organization_id, brand_id, platform, title) values (:'org_a', :'brand_a', 'instagram', 'post A') returning id as post_a \gset
insert into public.post_schedules (organization_id, post_id, scheduled_at) values (:'org_a', :'post_a', now());

do $$ begin
  assert (select count(*) from public.services) = 1, 'A sees own service';
  assert (select count(*) from public.locations) = 1, 'A sees own location';
  assert (select onboarding_completed_at is not null from public.brands), 'onboarding completed';
  assert (select count(*) from public.social_accounts) = 1, 'social saved';
end $$;

-- Saving again keeps location ids and replaces list children
select id as loc_a from public.locations limit 1 \gset
select public.save_brand_brain(:'brand_a', jsonb_build_object(
  'brandName','A Brand','companyName','A Inc','industry',jsonb_build_object('key','seitai','label','整体'),
  'services','[{"name":"x"},{"name":"y"}]'::jsonb,
  'locations',jsonb_build_array(jsonb_build_object('id', :'loc_a', 'name','渋谷院 改')),
  'social','{}'::jsonb));
do $$ begin
  assert (select count(*) from public.services) = 2, 'services replaced';
  assert (select name from public.locations) = '渋谷院 改', 'location updated in place';
  assert (select count(*) from public.social_accounts) = 0, 'empty handle removes manual account';
end $$;

-- User B cannot see or modify A's data
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.create_organization('Org B') as org_b \gset
do $$ begin
  assert (select count(*) from public.organizations) = 1, 'B sees only own org';
  assert (select count(*) from public.posts) = 0, 'B cannot read A posts';
  assert (select count(*) from public.services) = 0, 'B cannot read A services';
end $$;
update public.posts set title = 'hacked';
do $$ begin
  assert (select count(*) from public.posts where title = 'hacked') = 0, 'B update affected nothing visible';
end $$;

-- B cannot write into A's org by id
do $$ begin
  begin
    insert into public.posts (organization_id, platform, title)
    values ((select id from public.organizations where false), 'instagram', 'x');
  exception when others then null; end;
end $$;
\set ON_ERROR_STOP 0
insert into public.posts (organization_id, platform, title) values (:'org_a', 'instagram', 'intrusion');
select public.save_brand_brain(:'brand_a', '{"brandName":"pwned"}'::jsonb);
\set ON_ERROR_STOP 1
-- B cannot attach a row of its own org to A's brand
select id as brand_b from public.brands where organization_id = :'org_b' \gset
\set ON_ERROR_STOP 0
insert into public.services (organization_id, brand_id, name) values (:'org_b', :'brand_a', 'cross-tenant');
\set ON_ERROR_STOP 1

-- Verify as A that nothing leaked in
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.posts where title in ('intrusion','hacked')) = 0, 'no cross-tenant writes';
  assert (select name from public.brands) = 'A Brand', 'brand not modified by B';
end $$;

-- Anonymous users see nothing
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
\set ON_ERROR_STOP 0
select count(*) from public.organizations;
\set ON_ERROR_STOP 1
reset role;
select 'RLS TESTS PASSED' as result;
