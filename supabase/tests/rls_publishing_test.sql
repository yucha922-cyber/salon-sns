-- Publishing loop isolation tests:
--   cat auth_stub.sql ../migrations/*.sql rls_publishing_test.sql | psql
-- Checks: token vault unreadable for users, pipeline state not user-writable,
-- organization isolation, location-scoped members.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'b@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'manager@example.com');

-- Service-role setup (no auth.uid()): org A with two locations, accounts, a post, job, metrics, token.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
set role authenticated;
select public.create_organization('Org A') as org_a \gset
select id as brand_a from public.brands where organization_id = :'org_a' \gset
select public.save_brand_brain(:'brand_a', '{"brandName":"A","companyName":"A","industry":{"key":"seitai","label":"整体"},"locations":[{"name":"渋谷院"},{"name":"池袋院"}]}'::jsonb);
select id as loc_shibuya from public.locations where name = '渋谷院' \gset
select id as loc_ikebukuro from public.locations where name = '池袋院' \gset
insert into public.social_accounts (organization_id, brand_id, location_id, platform, handle, goal)
values (:'org_a', :'brand_a', :'loc_shibuya', 'instagram', '@shibuya', 'acquisition') returning id as acc_shibuya \gset
insert into public.social_accounts (organization_id, brand_id, location_id, platform, handle, goal)
values (:'org_a', :'brand_a', :'loc_ikebukuro', 'threads', '@ikebukuro', 'acquisition') returning id as acc_ikebukuro \gset
insert into public.posts (organization_id, platform, title, social_account_id, location_id, source)
values (:'org_a', 'instagram', 'p1', :'acc_shibuya', :'loc_shibuya', 'manual') returning id as post_shibuya \gset
insert into public.posts (organization_id, platform, title, social_account_id, location_id, source)
values (:'org_a', 'threads', 'p2', :'acc_ikebukuro', :'loc_ikebukuro', 'manual') returning id as post_ikebukuro \gset
insert into public.content_learnings (organization_id, location_id, learning, confidence) values (:'org_a', :'loc_shibuya', 'How-to Reelの保存率が高い', 0.7);
insert into public.media_assets (organization_id, location_id, post_id, storage_path, kind, mime_type, size_bytes)
values (:'org_a', :'loc_shibuya', :'post_shibuya', 'a/x.jpg', 'image', 'image/jpeg', 1000);

-- Users can NOT write pipeline tables or set publishing states themselves.
\set ON_ERROR_STOP 0
insert into public.publish_jobs (organization_id, social_account_id, post_id, provider, publish_format, scheduled_at, next_attempt_at, content_snapshot)
values (:'org_a', :'acc_shibuya', :'post_shibuya', 'instagram', 'IG_IMAGE', now(), now(), '{}');
update public.posts set status = 'queued' where id = :'post_shibuya';
update public.posts set provider_post_id = 'fake', published_at = now() where id = :'post_shibuya';
update public.social_accounts set connection_status = 'connected', external_account_id = 'x' where id = :'acc_shibuya';
insert into public.metric_snapshots (organization_id, social_account_id, post_id, provider, scope, metrics) values (:'org_a', :'acc_shibuya', :'post_shibuya', 'instagram', 'post', '{"reach":1}');
select * from public.social_account_credentials;
select * from public.social_oauth_pending;
\set ON_ERROR_STOP 1
do $$ begin
  assert (select status::text from public.posts where title = 'p1') = 'draft', 'user cannot queue a post';
  assert (select provider_post_id from public.posts where title = 'p1') is null, 'user cannot fake publish results';
  assert (select connection_status from public.social_accounts where handle = '@shibuya') = 'manual', 'user cannot fake a connection';
  assert (select count(*) from public.publish_jobs) = 0, 'user cannot insert jobs';
end $$;

-- Server (service role = no auth.uid()) drives the pipeline.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.social_account_credentials (social_account_id, organization_id, provider, external_account_id, access_token_ciphertext)
values (:'acc_shibuya', :'org_a', 'instagram', '17841', 'v1:iv:tag:cipher');
update public.social_accounts set connection_status = 'connected', external_account_id = '17841' where id = :'acc_shibuya';
insert into public.publish_jobs (organization_id, location_id, social_account_id, post_id, provider, publish_format, scheduled_at, next_attempt_at, content_snapshot)
values (:'org_a', :'loc_shibuya', :'acc_shibuya', :'post_shibuya', 'instagram', 'IG_IMAGE', now(), now(), '{"text":"x"}') returning id as job_shibuya \gset
insert into public.publish_jobs (organization_id, location_id, social_account_id, post_id, provider, publish_format, scheduled_at, next_attempt_at, content_snapshot)
values (:'org_a', :'loc_ikebukuro', :'acc_ikebukuro', :'post_ikebukuro', 'threads', 'THREADS_TEXT', now(), now(), '{"text":"y"}');
update public.posts set status = 'queued' where id = :'post_shibuya';
insert into public.metric_snapshots (organization_id, location_id, social_account_id, post_id, provider, scope, metrics, hours_since_publish)
values (:'org_a', :'loc_shibuya', :'acc_shibuya', :'post_shibuya', 'instagram', 'post', '{"reach":100}', 24),
       (:'org_a', :'loc_ikebukuro', :'acc_ikebukuro', :'post_ikebukuro', 'threads', 'post', '{"views":50}', 24);
insert into public.social_event_logs (organization_id, location_id, event_type, message) values (:'org_a', :'loc_shibuya', 'publish_queued', 'queued');

-- invalid values are rejected
\set ON_ERROR_STOP 0
insert into public.publish_jobs (organization_id, social_account_id, post_id, provider, publish_format, scheduled_at, next_attempt_at, content_snapshot, max_attempts)
values (:'org_a', :'acc_shibuya', :'post_shibuya', 'instagram', 'IG_IMAGE', now(), now(), '{}', 50);
insert into public.publish_jobs (organization_id, social_account_id, post_id, provider, publish_format, scheduled_at, next_attempt_at, content_snapshot)
values (:'org_a', :'acc_shibuya', :'post_shibuya', 'instagram', 'IG_IMAGE', now(), now(), '{}');
insert into public.social_event_logs (organization_id, event_type) values (:'org_a', 'hacked');
\set ON_ERROR_STOP 1
do $$ begin
  assert (select count(*) from public.publish_jobs where status = 'queued') = 2, 'one active job per post, max_attempts bounded';
end $$;

-- Member A (all locations) reads everything in the org, but never tokens.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.publish_jobs) = 2, 'A reads jobs';
  assert (select count(*) from public.metric_snapshots) = 2, 'A reads snapshots';
  assert (select count(*) from public.social_event_logs) = 1, 'A reads events';
end $$;
-- queued content is frozen for users
\set ON_ERROR_STOP 0
update public.posts set caption = 'changed after approval' where id = :'post_shibuya';
\set ON_ERROR_STOP 1
do $$ begin
  assert (select caption from public.posts where title = 'p1') = '', 'queued post cannot be edited';
end $$;

-- Location-scoped manager (池袋院 only)
reset role;
insert into public.organization_members (organization_id, user_id, role, location_ids)
values (:'org_a', '00000000-0000-0000-0000-0000000000c3', 'editor', array[:'loc_ikebukuro']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.publish_jobs) = 1, 'manager sees only Ikebukuro jobs';
  assert (select provider from public.publish_jobs)::text = 'threads', 'the Ikebukuro job';
  assert (select count(*) from public.metric_snapshots) = 1, 'manager sees only Ikebukuro metrics';
  assert (select count(*) from public.content_learnings) = 0, 'manager cannot read Shibuya learnings';
  assert (select count(*) from public.media_assets) = 0, 'manager cannot read Shibuya media';
end $$;
\set ON_ERROR_STOP 0
insert into public.content_learnings (organization_id, location_id, learning, confidence) values (:'org_a', :'loc_shibuya', 'x', 0.5);
\set ON_ERROR_STOP 1
insert into public.content_learnings (organization_id, location_id, learning, confidence) values (:'org_a', :'loc_ikebukuro', '池袋の学び', 0.5);

-- Another organization sees nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false);
select public.create_organization('Org B') as org_b \gset
do $$ begin
  assert (select count(*) from public.publish_jobs) = 0, 'B cannot read A jobs';
  assert (select count(*) from public.metric_snapshots) = 0, 'B cannot read A metrics';
  assert (select count(*) from public.post_performance_reviews) = 0, 'B cannot read A reviews';
  assert (select count(*) from public.content_learnings) = 0, 'B cannot read A learnings';
  assert (select count(*) from public.social_event_logs) = 0, 'B cannot read A events';
  assert (select count(*) from public.media_assets) = 0, 'B cannot read A media';
end $$;
\set ON_ERROR_STOP 0
insert into public.content_learnings (organization_id, learning, confidence) values (:'org_a', 'inject', 0.5);
insert into public.media_assets (organization_id, post_id, storage_path, kind, mime_type, size_bytes) values (:'org_b', :'post_shibuya', 'b/x.jpg', 'image', 'image/jpeg', 1);
select * from public.social_account_credentials;
\set ON_ERROR_STOP 1
reset role;
do $$ begin
  assert (select count(*) from public.content_learnings where learning = 'inject') = 0, 'B cannot write into A';
  assert (select count(*) from public.media_assets where storage_path = 'b/x.jpg') = 0, 'B cannot attach media to A post';
end $$;

select 'PUBLISHING RLS TESTS PASSED' as result;
