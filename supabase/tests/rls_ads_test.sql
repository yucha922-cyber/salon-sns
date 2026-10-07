-- Ad optimization loop isolation tests:
--   cat auth_stub.sql ../migrations/*.sql rls_ads_test.sql | psql
-- Checks: ad token vault unreadable, synced / pipeline state not user-writable,
-- AI cannot be "approved" from the browser, organization isolation,
-- location-scoped members, cross-organization references rejected.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a4', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b4', 'b@example.com'),
  ('00000000-0000-0000-0000-0000000000c4', 'manager@example.com');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select public.create_organization('Org A') as org_a \gset
select id as brand_a from public.brands where organization_id = :'org_a' \gset
select public.save_brand_brain(:'brand_a', '{"brandName":"A","companyName":"A","industry":{"key":"seitai","label":"整体"},"locations":[{"name":"渋谷院"},{"name":"池袋院"}]}'::jsonb);
select id as loc_shibuya from public.locations where name = '渋谷院' \gset
select id as loc_ikebukuro from public.locations where name = '池袋院' \gset

-- Users cannot create ad accounts, read tokens or write metrics / tests.
\set ON_ERROR_STOP 0
insert into public.ad_accounts (organization_id, external_account_id, name) values (:'org_a', 'act_1', 'fake');
select * from public.ad_account_credentials;
\set ON_ERROR_STOP 1

-- Server (service role) connects + syncs.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.ad_accounts (organization_id, external_account_id, name, connection_status) values (:'org_a', 'act_1', 'NAORU', 'connected') returning id as acct \gset
insert into public.ad_account_credentials (ad_account_id, organization_id, access_token_ciphertext) values (:'acct', :'org_a', 'v1:iv:tag:cipher');
insert into public.campaigns (organization_id, ad_account_id, location_id, provider, external_id, name, status, daily_budget, goal)
values (:'org_a', :'acct', :'loc_shibuya', 'meta', 'c1', '渋谷院 新規集客', 'ACTIVE', 9000, 'acquisition') returning id as camp_shibuya \gset
insert into public.campaigns (organization_id, ad_account_id, location_id, provider, external_id, name, status, daily_budget, goal)
values (:'org_a', :'acct', :'loc_ikebukuro', 'meta', 'c2', '池袋院 新規集客', 'ACTIVE', 6000, 'acquisition') returning id as camp_ikebukuro \gset
insert into public.ad_sets (organization_id, campaign_id, location_id, external_id, name, status) values (:'org_a', :'camp_shibuya', :'loc_shibuya', 's1', 'set', 'ACTIVE') returning id as set_shibuya \gset
insert into public.creatives (organization_id, ad_account_id, location_id, external_id, source, concept, headline, body, cta, status)
values (:'org_a', :'acct', :'loc_shibuya', 'cr1', 'synced', 'A', 'その肩こり', 'x', 'BOOK_NOW', 'active') returning id as cr_a \gset
insert into public.creatives (organization_id, location_id, source, concept, headline, body, cta, status)
values (:'org_a', :'loc_shibuya', 'ai_generated', 'B', '仕事終わり', 'x', 'BOOK_NOW', 'in_review') returning id as cr_b \gset
insert into public.ads (organization_id, campaign_id, ad_set_id, creative_id, location_id, external_id, name, status)
values (:'org_a', :'camp_shibuya', :'set_shibuya', :'cr_a', :'loc_shibuya', 'ad1', 'A', 'ACTIVE') returning id as ad_a \gset
insert into public.ad_metric_snapshots (organization_id, ad_account_id, location_id, entity_type, entity_id, date, date_stop, spend, impressions, clicks, conversions, source)
values (:'org_a', :'acct', :'loc_shibuya', 'campaign', :'camp_shibuya', '2026-10-01', '2026-10-01', 9000, 10000, 150, 7, 'mock'),
       (:'org_a', :'acct', :'loc_ikebukuro', 'campaign', :'camp_ikebukuro', '2026-10-01', '2026-10-01', 6000, 8000, 120, 4, 'mock'),
       (:'org_a', :'acct', null, 'account', :'acct', '2026-10-01', '2026-10-01', 15000, 18000, 270, 11, 'mock');
insert into public.creative_hypotheses (organization_id, location_id, campaign_id, ad_id, problem, hypothesis, change_variable, primary_metric, confidence)
values (:'org_a', :'loc_shibuya', :'camp_shibuya', :'ad_a', 'CTR低下', '仕事終わり', 'hook', 'cpa', 0.6) returning id as hyp \gset
insert into public.experiments (organization_id, location_id, campaign_id, ad_set_id, hypothesis_id, name, variable, hypothesis, primary_metric, status)
values (:'org_a', :'loc_shibuya', :'camp_shibuya', :'set_shibuya', :'hyp', '渋谷 Hook', 'hook', 'h', 'cpa', 'running') returning id as exp \gset
insert into public.experiment_variants (organization_id, experiment_id, role, label, creative_id, ad_id) values (:'org_a', :'exp', 'control', 'A', :'cr_a', :'ad_a');
insert into public.ad_conversions (organization_id, location_id, campaign_id, kind, occurred_on, count, source) values (:'org_a', :'loc_shibuya', :'camp_shibuya', 'reservation', '2026-10-01', 3, 'csv');
insert into public.ai_ad_analyses (organization_id, period_start, period_end, summary) values (:'org_a', '2026-09-25', '2026-10-01', 's');
insert into public.content_learnings (organization_id, location_id, learning, confidence, kind, attributes, source_experiment_id)
values (:'org_a', :'loc_shibuya', '生活シーンのHookが勝ち', 0.7, 'creative', '{"variable":"hook"}', :'exp');
insert into public.social_event_logs (organization_id, event_type, message, actor_user_id) values (:'org_a', 'experiment_started', 'started', '00000000-0000-0000-0000-0000000000a4');

-- Constraint checks
\set ON_ERROR_STOP 0
insert into public.ad_metric_snapshots (organization_id, entity_type, entity_id, date, date_stop, source) values (:'org_a', 'campaign', :'camp_shibuya', '2026-10-01', '2026-10-01', 'mock');
insert into public.creative_hypotheses (organization_id, problem, hypothesis, change_variable, primary_metric, confidence) values (:'org_a', 'p', 'h', 'budget', 'cpa', 0.5);
insert into public.experiments (organization_id, name, variable, hypothesis, primary_metric, status) values (:'org_a', 'x', 'hook', 'h', 'cpa', 'auto_published');
\set ON_ERROR_STOP 1
do $$ begin
  assert (select count(*) from public.ad_metric_snapshots) = 3, 'one snapshot per entity and day';
  assert (select count(*) from public.creative_hypotheses) = 1, 'budget is not a creative test variable';
  assert (select count(*) from public.experiments) = 1, 'invalid experiment status rejected';
end $$;

-- Member A (owner, all locations): reads everything except tokens; cannot forge state.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ad_accounts) = 1, 'A reads ad accounts';
  assert (select count(*) from public.ad_metric_snapshots) = 3, 'A reads snapshots';
  assert (select count(*) from public.experiments) = 1, 'A reads experiments';
  assert (select count(*) from public.experiment_variants) = 1, 'A reads variants';
  assert (select count(*) from public.ad_conversions) = 1, 'A reads first-party conversions';
end $$;
\set ON_ERROR_STOP 0
select * from public.ad_account_credentials;
update public.campaigns set daily_budget = 99999 where id = :'camp_shibuya';
update public.campaigns set effective_status = 'PAUSED' where id = :'camp_shibuya';
update public.ads set external_id = 'hijack' where id = :'ad_a';
update public.creatives set status = 'approved' where id = :'cr_b';
update public.creatives set status = 'published' where id = :'cr_b';
insert into public.ad_metric_snapshots (organization_id, entity_type, entity_id, date, date_stop, source) values (:'org_a', 'campaign', :'camp_shibuya', '2026-10-02', '2026-10-02', 'mock');
update public.experiments set status = 'completed', decision = 'winner' where id = :'exp';
insert into public.experiments (organization_id, name, variable, hypothesis, primary_metric) values (:'org_a', 'x', 'hook', 'h', 'cpa');
update public.ad_accounts set connection_status = 'connected', name = 'x' where id = :'acct';
\set ON_ERROR_STOP 1
reset role;
do $$ begin
  assert (select daily_budget from public.campaigns where external_id = 'c1') = 9000, 'user cannot change budgets';
  assert (select effective_status from public.campaigns where external_id = 'c1') is null, 'user cannot fake delivery state';
  assert (select external_id from public.ads where name = 'A') = 'ad1', 'user cannot change provider ids';
  assert (select status from public.creatives where concept = 'B') = 'in_review', 'approval only through the server (who approved is recorded)';
  assert (select count(*) from public.ad_metric_snapshots) = 3, 'user cannot write metrics';
  assert (select status from public.experiments) = 'running', 'user cannot complete a test or pick a winner';
  assert (select name from public.ad_accounts) = 'NAORU', 'user cannot edit connection state';
end $$;

-- Location-scoped manager (池袋院 only)
insert into public.organization_members (organization_id, user_id, role, location_ids)
values (:'org_a', '00000000-0000-0000-0000-0000000000c4', 'editor', array[:'loc_ikebukuro']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.ad_metric_snapshots) = 1, 'manager sees only Ikebukuro metrics (not account totals)';
  assert (select count(*) from public.experiments) = 0, 'manager cannot read Shibuya tests';
  assert (select count(*) from public.experiment_variants) = 0, 'manager cannot read Shibuya variants';
  assert (select count(*) from public.creative_hypotheses) = 0, 'manager cannot read Shibuya hypotheses';
  assert (select count(*) from public.ad_conversions) = 0, 'manager cannot read Shibuya conversions';
end $$;

-- Another organization sees nothing and cannot point at A's objects.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b4', false);
select public.create_organization('Org B') as org_b \gset
do $$ begin
  assert (select count(*) from public.ad_accounts) = 0, 'B cannot read A ad accounts';
  assert (select count(*) from public.ad_metric_snapshots) = 0, 'B cannot read A metrics';
  assert (select count(*) from public.experiments) = 0, 'B cannot read A tests';
  assert (select count(*) from public.experiment_variants) = 0, 'B cannot read A variants';
  assert (select count(*) from public.ai_ad_analyses) = 0, 'B cannot read A analyses';
  assert (select count(*) from public.campaigns) = 0, 'B cannot read A campaigns';
  assert (select count(*) from public.content_learnings) = 0, 'B cannot read A creative memory';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
\set ON_ERROR_STOP 0
insert into public.experiments (organization_id, campaign_id, name, variable, hypothesis, primary_metric) values (:'org_b', :'camp_shibuya', 'x', 'hook', 'h', 'cpa');
insert into public.experiment_variants (organization_id, experiment_id, role, label) values (:'org_b', :'exp', 'challenger', 'Z');
insert into public.ad_metric_snapshots (organization_id, ad_account_id, entity_type, entity_id, date, date_stop, source) values (:'org_b', :'acct', 'account', :'acct', '2026-10-01', '2026-10-01', 'mock');
insert into public.ad_account_credentials (ad_account_id, organization_id, access_token_ciphertext) values (:'acct', :'org_b', 'x');
\set ON_ERROR_STOP 1
do $$ begin
  assert (select count(*) from public.experiments) = 1, 'no cross-organization experiment';
  assert (select count(*) from public.experiment_variants) = 1, 'no cross-organization variant';
  assert (select count(*) from public.ad_metric_snapshots) = 3, 'no cross-organization metrics';
end $$;

select 'ADS RLS TESTS PASSED' as result;
