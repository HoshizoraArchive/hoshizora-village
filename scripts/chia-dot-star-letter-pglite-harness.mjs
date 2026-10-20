#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { fixtureClient } from "./chia-dot-star-letter-fixture-db.mjs";
import { handleChiaDotStarLetter } from "../netlify/functions/chia-dot-star-letter.mjs";
import { signChiaDotStarLetterRequest, verifyChiaDotStarLetterRequest } from "../netlify/functions/_shared/chiaDotStarLetterAuth.mjs";
import { invokeChiaPersonGeneration } from "../netlify/functions/_shared/chiaPersonGenerationContract.mjs";

import { memoryRevisionJourney } from './chia-dot-memory-revision-journey.mjs';

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const modulePath = process.env.CHIA_PGLITE_MODULE
  ?? "/tmp/chia-hardening-tools/node_modules/@electric-sql/pglite/dist/index.js";
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);

const baseline = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema app_private;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', username text not null unique
);
create table public.profile_kinds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('human','ai_resident'))
);
create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null, primary key(profile_id,role_key)
);
create function public.fixture_profile_kind() returns trigger language plpgsql as $$
begin insert into public.profile_kinds(profile_id,kind) values(new.id,'human'); return new; end
$$;
create trigger fixture_profile_kind after insert on public.profiles
  for each row execute function public.fixture_profile_kind();
create table public.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id),
  body text not null, visibility text not null default 'public', deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.star_letters (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade, body text not null,
  parent_star_letter_id uuid references public.star_letters(id) on delete cascade,
  client_request_id uuid, deleted_at timestamptz,
  created_at timestamptz not null default now()-interval '10 minutes', updated_at timestamptz not null default now()
);
-- Deliberately match actual Production's transaction-stable trigger so that
-- the replay fails if the source monotonic safety migrations are missing.
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end
$$;
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
create trigger star_letters_set_updated_at before update on public.star_letters
  for each row execute function public.set_updated_at();
create unique index star_letters_client_request_fixture_unique
  on public.star_letters(author_id,client_request_id) where client_request_id is not null;
create table public.profile_blocks (
  blocker_id uuid not null references public.profiles(id), blocked_id uuid not null references public.profiles(id),
  primary key(blocker_id,blocked_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id),
  actor_id uuid references public.profiles(id), star_letter_id uuid references public.star_letters(id),
  type text not null
);
create function public.fixture_star_letter_notification() returns trigger language plpgsql as $$
declare v_recipient uuid;
begin
  if new.parent_star_letter_id is null then return new; end if;
  select author_id into v_recipient from public.star_letters where id=new.parent_star_letter_id;
  if v_recipient is not null and v_recipient<>new.author_id then
    insert into public.notifications(recipient_id,actor_id,star_letter_id,type)
    values(v_recipient,new.author_id,new.id,'star_letter_reply');
  end if;
  return new;
end
$$;
create trigger fixture_star_letter_notification after insert on public.star_letters
  for each row execute function public.fixture_star_letter_notification();
`;

async function sql(db, statement) {
  return await db.query(statement);
}

async function apply(db, relativePath) {
  const source = await readFile(resolve(repo, relativePath), "utf8");
  try {
    await db.exec(source);
  } catch (error) {
    error.message = `${relativePath}: ${error.message}`;
    throw error;
  }
}

async function fixtureUsers(db, chiaId, humanId) {
  await db.exec(`
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
      ('00000000-0000-0000-0000-000000000000','${chiaId}','authenticated','authenticated','chia@fixture.invalid','',now(),'{}','{}',now(),now()),
      ('00000000-0000-0000-0000-000000000000','${humanId}','authenticated','authenticated','human@fixture.invalid','',now(),'{}','{}',now(),now());
    insert into public.profiles(id,display_name,username) values
      ('${chiaId}','fixture chia','fixture_chia'),('${humanId}','fixture human','fixture_human');
    update public.profile_kinds set kind='ai_resident' where profile_id='${chiaId}';
    insert into public.posts(id,author_id,body) values
      ('42000000-0000-4000-8000-000000000001','${chiaId}','synthetic post');
  `);
}

async function oldMigrationRegression() {
  const db = new PGlite();
  try {
    await db.exec(baseline);
    await apply(db, "supabase/migrations/20260908123500_add_chia_star_letter_reply_runs.sql");
    await apply(db, "supabase/migrations/20261010213000_chia_reply_memory_and_fencing.sql");
    const chia = "41000000-0000-4000-8000-000000000001";
    const human = "41000000-0000-4000-8000-000000000002";
    const source = "43000000-0000-4000-8000-000000000001";
    await fixtureUsers(db, chia, human);
    await sql(db, `insert into public.star_letters(id,post_id,author_id,body,created_at)
      values('${source}','42000000-0000-4000-8000-000000000001','${human}','before edit',now()-interval '10 minutes')`);
    const claimDefinition = (await sql(db, `select pg_get_functiondef('public.claim_chia_star_letter_reply_run(uuid,uuid)'::regprocedure) as definition`)).rows[0].definition;
    assert.equal(claimDefinition.includes("not_due"), false, "pre-hardening claim must not include hardening-only due checks");
    const legacyDefinition = (await sql(db, `select pg_get_functiondef('public.claim_chia_star_letter_reply_run_legacy(uuid,uuid)'::regprocedure) as definition`)).rows[0].definition;
    assert.equal(legacyDefinition.includes("not_due"), false, "renamed claim must preserve pre-hardening behavior");
    const claim = (await sql(db, `select public.claim_chia_star_letter_reply_run_legacy('${source}','${chia}') as value`)).rows[0].value;
    if (claim.outcome !== "claimed") console.error("pre-hardening claim diagnostic", claim, claimDefinition, legacyDefinition);
    assert.equal(claim.outcome, "claimed", "pre-hardening fixture should claim a due source");
    await sql(db, `update public.star_letters set body='edited after claim' where id='${source}'`);
    const token = (await sql(db, `select claim_token from public.chia_star_letter_reply_runs where id='${claim.run_id}'`)).rows[0].claim_token;
    const complete = (await sql(db, `select public.complete_chia_star_letter_reply_run(
      '${claim.run_id}','${chia}','reply','stale generation','${token}') as value`)).rows[0].value;
    assert.equal(complete.outcome, "replied");
    assert.equal((await sql(db, `select count(*)::int as n from public.star_letters where parent_star_letter_id='${source}' and author_id='${chia}'`)).rows[0].n, 1);
    return "RED reproduced: old completion accepted a source edited after claim";
  } finally {
    await db.close();
  }
}

async function hardenedMigrations() {
  const db = new PGlite();
  try {
    await db.exec(baseline);
    await apply(db, "supabase/migrations/20260908123500_add_chia_star_letter_reply_runs.sql");
    await apply(db, "supabase/migrations/20261010213000_chia_reply_memory_and_fencing.sql");
    await apply(db, "supabase/migrations/20261020120000_chia_dot_reply_atomic_guards.sql");
    // The follow-on migration is deliberately replayed to prove safe idempotence.
    await apply(db, "supabase/migrations/20261020120000_chia_dot_reply_atomic_guards.sql");
    await apply(db, "supabase/migrations/20261020123000_chia_source_monotonic_revisions.sql");
    await apply(db, "supabase/migrations/20261020124500_chia_source_monotonic_any_update.sql");
    await apply(db, "supabase/tests/chia-person-memory-fencing-assertions.sql");
    await apply(db, "supabase/tests/chia-star-letter-reply-assertions.sql");
    await apply(db, "supabase/tests/chia-dot-atomic-guards-assertions.sql");
    await apply(db, "supabase/tests/chia-dot-discovery-fairness-assertions.sql");
    await signedEndpointJourney(db);
    await memoryRevisionJourney(db);
    return "GREEN: hardening migration replay, three original SQL/RLS suites plus fairness suite and memory revision journeys passed";
  } finally {
    await db.close();
  }
}

async function signedEndpointJourney(pg) {
  const chia = '41000000-0000-4000-8000-000000000001';
  const human = '41000000-0000-4000-8000-000000000002';
  const sourceId = '43000000-0000-4000-8000-000000000001';
  await fixtureUsers(pg, chia, human);
  await pg.exec(`insert into public.profile_roles values('${human}','founder');
    insert into public.star_letters(id,post_id,author_id,body,created_at)
    values('${sourceId}','42000000-0000-4000-8000-000000000001','${human}','I enjoy composing songs.',now()-interval '10 minutes')`);
  const db = fixtureClient(pg);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const env = { CHIA_DOT_STAR_LETTER_ENABLED: 'true',
    // Exact guard configuration is synthetic data; createClient below cannot network.
    SUPABASE_URL: 'https://dhfecpymvmursozfgjlr.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-never-a-real-key',
    CHIA_DAILY_METEOR_PROFILE_ID: chia, CHIA_FOUNDER_PROFILE_ID: human };
  const deps = { readEnv: (key) => env[key], createClient: () => db,
    verifyRequest: (payload, options) => verifyChiaDotStarLetterRequest(payload, { ...options, publicKey }) };
  const context = { deploy: { context: 'production', published: true } };
  let claim;
  const send = async (action, body = '', decision = '') => {
    const payload = signChiaDotStarLetterRequest({ action, privateKey,
      ...(action === 'discover' ? {} : { sourceId }),
      ...(!['discover','claim','status'].includes(action) ? { runId: claim.runId, claimToken: claim.claimToken, attempts: claim.attempts, snapshotHash: claim.snapshotHash } : {}), body, decision });
    const response = await handleChiaDotStarLetter(new Request('http://fixture.invalid/api/chia-dot-star-letter',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }), context, deps);
    const result = await response.json();
    assert.equal(response.status, 200, `${action}: ${JSON.stringify(result)}`);
    return result;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('harness_network_forbidden'); };
  try {
    assert.deepEqual((await send('discover')).sourceIds, [sourceId]);
    claim = await send('claim');
    assert.equal(claim.outcome, 'claimed');
    assert.equal(claim.context.accountId, human);
    assert.equal(claim.context.isFounder, true);
    assert.match(claim.generationInvocationId, /^[a-f0-9-]{36}$/);
    const receipts = new Map();
    let generations = 0;
    const adapter = { ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false,
      outputTokenLimitEnforced: true, idempotencyEnforced: true,
      countInputTokens: async () => 120, quoteCostMicrousd: async () => 100,
      authorizeWake: async () => send('wake'),
      lookupGeneration: async (id) => receipts.get(id) ?? { outcome: 'not_found' },
      generate: async (request, options) => {
        assert.equal(options.idempotencyKey, claim.generationInvocationId);
        generations++;
        receipts.set(request.invocationId, { outcome: 'completed', result: 'Composing sounds lovely.' });
        throw new Error('synthetic_lost_provider_response');
      } };
    await assert.rejects(invokeChiaPersonGeneration(claim, claim.generationBudget, adapter), /synthetic_lost_provider_response/);
    const generated = await invokeChiaPersonGeneration(claim, claim.generationBudget, adapter);
    assert.equal(generated, 'Composing sounds lovely.');
    assert.equal(generations, 1);
    const processing = await send('status');
    assert.equal(processing.generationInvocationId, claim.generationInvocationId);
    assert.ok(processing.providerWakeAt);
    await pg.exec(`update public.chia_star_letter_reply_runs set updated_at=now()-interval '16 minutes' where id='${claim.runId}'`);
    assert.equal((await send('claim')).outcome, 'generation_reconciliation_required', 'unknown provider result must not create a new attempt');
    assert.equal((await send('discover')).outcome, 'no_candidate');
    const complete = await send('complete', generated, 'reply');
    assert.equal(complete.outcome, 'replied');
    assert.equal((await send('complete', generated, 'reply')).replyStarLetterId, complete.replyStarLetterId);
    assert.equal((await send('fail')).outcome, 'replied');
    assert.equal((await send('discover')).outcome, 'no_candidate');
    const memory = JSON.stringify({ memoryKey: 'composing', evidenceQuote: 'I enjoy composing songs.' });
    assert.equal((await send('remember', memory)).outcome, 'remembered');
    assert.equal((await send('remember', memory)).outcome, 'remembered');
    assert.equal((await pg.query('select count(*)::int as n from public.chia_person_memories')).rows[0].n, 1);
    await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${human}',false);
      update public.chia_person_memories set content='Owner corrected this memory'; reset role;`);
    await send('remember', memory);
    assert.equal((await pg.query('select content from public.chia_person_memories')).rows[0].content, 'Owner corrected this memory');
    await pg.exec(`set role authenticated; delete from public.chia_person_memories; reset role;`);
    await send('remember', memory);
    assert.equal((await pg.query('select count(*)::int as n from public.chia_person_memories')).rows[0].n, 0, 'retry must not restore an owner-deleted memory');
    await pg.exec(`update public.star_letters set body='Edited after completion' where id='${sourceId}'`);
    env.CHIA_DOT_STAR_LETTER_ENABLED = 'false';
    assert.equal((await send('status')).replyStarLetterId, complete.replyStarLetterId);
    assert.equal((await pg.query(`select count(*)::int as n from public.star_letters where parent_star_letter_id='${sourceId}'`)).rows[0].n, 1);
    assert.equal((await pg.query('select count(*)::int as n from public.notifications')).rows[0].n, 1);
    // The source itself stays unchanged while its direct conversation parent
    // changes after claim. All write gates must reject that stale context too.
    const child = '43000000-0000-4000-8000-000000000002';
    await pg.query(`insert into public.star_letters(id,post_id,author_id,body,parent_star_letter_id,created_at)
      values($1,'42000000-0000-4000-8000-000000000001',$2,'Another clear fact',$3,now()-interval '10 minutes')`, [child, human, complete.replyStarLetterId]);
    const childClaim = (await db.rpc('claim_chia_star_letter_reply_run', { p_source_star_letter_id: child, p_chia_profile_id: chia })).data;
    assert.equal(childClaim.outcome, 'claimed');
    assert.equal((await db.rpc('chia_dot_run_source_fresh', { p_run_id: childClaim.run_id })).data, true);
    await pg.query('update public.star_letters set body=$1 where id=$2', ['Parent edited after claim', complete.replyStarLetterId]);
    assert.equal((await db.rpc('chia_dot_run_source_fresh', { p_run_id: childClaim.run_id })).data, false);
    assert.equal((await db.rpc('authorize_chia_dot_provider_wake', { p_run_id: childClaim.run_id, p_chia_profile_id: chia,
      p_person_profile_id: human, p_claim_token: childClaim.claim_token })).data.outcome, 'stale_source');
    const args = { p_run_id: childClaim.run_id, p_chia_profile_id: chia, p_decision: 'reply', p_body: 'Must not post', p_claim_token: childClaim.claim_token };
    assert.equal((await db.rpc('complete_chia_star_letter_reply_run', args)).data.outcome, 'stale_source');
    // Isolate freshness from the separate one-shot authorization gate.
    await pg.query('update public.chia_star_letter_reply_runs set provider_wake_at=now() where id=$1', [childClaim.run_id]);
    assert.equal((await db.rpc('complete_chia_star_letter_reply_run', { ...args,
      p_source_updated_at: childClaim.source_updated_at, p_post_updated_at: childClaim.post_updated_at })).data.outcome, 'stale_source');
    await pg.query("update public.chia_star_letter_reply_runs set status='replied',reply_star_letter_id=$1 where id=$2", [complete.replyStarLetterId, childClaim.run_id]);
    assert.equal((await db.rpc('remember_chia_star_letter_reply', { p_run_id: childClaim.run_id, p_chia_profile_id: chia,
      p_person_profile_id: human, p_claim_token: childClaim.claim_token, p_source_star_letter_id: child,
      p_source_updated_at: childClaim.source_updated_at, p_post_updated_at: childClaim.post_updated_at,
      p_memory_key: 'parent_fact', p_content: 'Another clear fact', p_importance: 3 })).data.outcome, 'source_changed_or_invalid');
    assert.equal((await pg.query('select count(*)::int as n from public.star_letters where parent_star_letter_id=$1', [child])).rows[0].n, 0);
    assert.equal((await pg.query('select count(*)::int as n from public.chia_person_memories')).rows[0].n, 0);
  } finally { globalThis.fetch = originalFetch; }
  console.log('GREEN: signed endpoint → catalog-typed RPCs → PGlite reply/memory/RLS/status; lost-provider-response reconciled once');
}

try {
  const red = await oldMigrationRegression();
  const green = await hardenedMigrations();
  console.log(red);
  console.log(green);
  console.log("fixture boundary: in-process PGlite only; no network, credentials, Preview, or Production access");
} catch (error) {
  console.error(`PGlite harness failed: ${error.message}${error.code ? ` (SQLSTATE ${error.code})` : ""}`);
  process.exitCode = 1;
}
