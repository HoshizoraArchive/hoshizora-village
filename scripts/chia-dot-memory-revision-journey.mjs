// In-process, synthetic only. Called by the PGlite harness; no network or keys.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { fixtureClient } from './chia-dot-star-letter-fixture-db.mjs';
import { handleChiaDotStarLetter } from '../netlify/functions/chia-dot-star-letter.mjs';
import { signChiaDotStarLetterRequest, verifyChiaDotStarLetterRequest } from '../netlify/functions/_shared/chiaDotStarLetterAuth.mjs';

export async function memoryRevisionJourney(pg) {
  const chia = '71000000-0000-4000-8000-000000000001';
  const human = '71000000-0000-4000-8000-000000000002';
  const other = '71000000-0000-4000-8000-000000000003';
  const post = '72000000-0000-4000-8000-000000000001';
  const memoryPost = '72000000-0000-4000-8000-000000000002';
  const memorySource = '73000000-0000-4000-8000-000000000001';
  await pg.exec(`insert into auth.users(id,email) values('${chia}','revision-chia@fixture.invalid'),('${human}','revision-person@fixture.invalid'),('${other}','revision-other@fixture.invalid');
    insert into public.profiles(id,username) values('${chia}','revision_chia'),('${human}','revision_person'),('${other}','revision_other');
    update public.profile_kinds set kind='ai_resident' where profile_id='${chia}';
    insert into public.posts(id,author_id,body) values('${post}','${chia}','current conversation'),('${memoryPost}','${chia}','another post');`);
  const db = fixtureClient(pg);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const env = { CHIA_DOT_STAR_LETTER_ENABLED: 'true', SUPABASE_URL: 'https://dhfecpymvmursozfgjlr.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-never-a-real-key', CHIA_DAILY_METEOR_PROFILE_ID: chia };
  const context = { deploy: { context: 'production', published: true } };
  let claim, sourceId, beforeComplete;
  const deps = { readEnv: (key) => env[key], createClient: () => ({ ...db, rpc: async (name, args) => {
    if (name === 'complete_chia_star_letter_reply_run' && beforeComplete) { const change = beforeComplete; beforeComplete = null; await change(); }
    return db.rpc(name, args);
  } }), verifyRequest: (payload, opts) => verifyChiaDotStarLetterRequest(payload, { ...opts, publicKey }) };
  async function send(action, body = '') {
    const payload = signChiaDotStarLetterRequest({ action, privateKey, sourceId,
      ...(!['claim','status'].includes(action) ? { runId: claim.runId, claimToken: claim.claimToken,
        attempts: claim.attempts, snapshotHash: claim.snapshotHash } : {}), body, decision: action === 'complete' ? 'reply' : '' });
    const response = await handleChiaDotStarLetter(new Request('http://fixture.invalid/api/chia-dot-star-letter', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }), context, deps);
    return { status: response.status, data: await response.json() };
  }
  async function ownerChange(statement) {
    await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${human}',false);`);
    try { await pg.exec(statement); } finally { await pg.exec('reset role'); }
  }
  const changes = [
    ['owner delete', () => ownerChange('delete from public.chia_person_memories')],
    ['owner correction', () => ownerChange("update public.chia_person_memories set content='corrected fact'")],
    ['owner edit then restore (ABA)', () => ownerChange("update public.chia_person_memories set content='corrected fact'; update public.chia_person_memories set content='obsolete fact'")],
    ['other-post source invalidation', () => pg.exec(`update public.star_letters set body='changed evidence' where id='${memorySource}'`)],
    ['other-post source hard delete', () => pg.exec(`delete from public.star_letters where id='${memorySource}'`)],
    ['other-post privacy invalidation', () => pg.exec(`update public.posts set visibility='private' where id='${memoryPost}'`)],
    ['cleanup delete', () => pg.exec('delete from public.chia_person_memories')],
    ['cleanup truncate', () => pg.exec('truncate public.chia_person_memories cascade')],
    ['cross-session new memory', () => pg.exec(`insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,memory_key,content)
      values('${chia}','${human}','${memorySource}','new_fact','cross-session fact')`)],
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('harness_network_forbidden'); };
  try {
    for (let i = 0; i < changes.length; i++) {
      const [label, mutate] = changes[i];
      await pg.exec(`delete from public.chia_person_memories; delete from public.star_letters where id='${memorySource}';
        update public.posts set visibility='public' where id='${memoryPost}';
        insert into public.star_letters(id,post_id,author_id,body,created_at) values('${memorySource}','${memoryPost}','${human}','obsolete fact',now()-interval '1 hour');
        insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,memory_key,content)
          values('${chia}','${human}','${memorySource}','old_fact','obsolete fact');
        update public.chia_star_letter_reply_budget_global set last_wake_at=null;
        update public.chia_star_letter_reply_budget_days set last_wake_at=null;`);
      sourceId = `73000000-0000-4000-8000-${String(100+i).padStart(12,'0')}`;
      await pg.query('insert into public.star_letters(id,post_id,author_id,body,created_at) values($1,$2,$3,$4,now()-interval \'10 minutes\')', [sourceId,post,human,'new incoming']);
      const claimed = await send('claim');
      assert.equal(claimed.status, 200, label);
      claim = claimed.data;
      assert.equal(claim.outcome, 'claimed', JSON.stringify(claim));
      assert.ok(claim.context.rememberedFacts.some((f) => f.content === 'obsolete fact'), label);
      assert.equal((await send('wake')).data.outcome, 'authorized', label);
      beforeComplete = mutate; // Commit after the endpoint's snapshot recheck, before atomic SQL publish.
      const completed = await send('complete', 'stale generated body using obsolete fact');
      assert.equal(completed.status, 409, `${label}: stale completion accepted ${JSON.stringify(completed)}`);
      assert.equal(completed.data.code, 'stale_snapshot', label);
      const stored = await pg.query(`select count(*)::int as n from public.star_letters where parent_star_letter_id=$1 or body='stale generated body using obsolete fact'`, [sourceId]);
      assert.equal(stored.rows[0].n, 0, `${label}: stale body recorded`);
      const run = (await pg.query('select status,reply_star_letter_id from public.chia_star_letter_reply_runs where id=$1', [claim.runId])).rows[0];
      assert.equal(run.status, 'processing'); assert.equal(run.reply_star_letter_id, null);
      const remembered = await send('remember', JSON.stringify({memoryKey:'stale_fact',evidenceQuote:'new incoming'}));
      assert.equal(remembered.status, 409, `${label}: unpublished generation could remember`);
      // Both legacy overloads also fail closed, rather than bypassing the revision fence.
      for (const token of ['', `,'${claim.claimToken}'::uuid`]) {
        const result = (await pg.query(`select public.complete_chia_star_letter_reply_run('${claim.runId}','${chia}','reply','stale generated body using obsolete fact'${token}) as v`)).rows[0].v;
        assert.equal(result.outcome, 'stale_memory', `${label}: legacy bypass`);
      }
      console.log(`GREEN: committed ${label} between snapshot and publish rejected; no stale body/remember`);
    }
    // A different person's partition must not invalidate an otherwise fresh reply.
    sourceId = '73000000-0000-4000-8000-000000000199';
    await pg.exec(`update public.chia_star_letter_reply_budget_global set last_wake_at=null;
      update public.chia_star_letter_reply_budget_days set last_wake_at=null;
      insert into public.star_letters(id,post_id,author_id,body,created_at) values('${sourceId}','${post}','${human}','new incoming',now()-interval '10 minutes'),
        ('73000000-0000-4000-8000-000000000198','${memoryPost}','${other}','other person evidence',now()-interval '10 minutes');`);
    claim = (await send('claim')).data;
    assert.equal(claim.outcome, 'claimed');
    assert.equal((await send('wake')).data.outcome, 'authorized');
    beforeComplete = () => pg.exec(`insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,memory_key,content)
      values('${chia}','${other}','73000000-0000-4000-8000-000000000198','other_fact','other person evidence')`);
    const fresh = await send('complete','fresh partition reply');
    assert.equal(fresh.status, 200, JSON.stringify(fresh));
    assert.equal(fresh.data.outcome, 'replied');
    assert.equal((await send('complete','fresh partition reply')).data.replyStarLetterId, fresh.data.replyStarLetterId);
    console.log('GREEN: other-person memory change permits own fresh reply; replay returns same reply ID');
    // A second signed session remembers a new fact while this one finalizes.
    const incomingA = '73000000-0000-4000-8000-000000000201';
    const incomingB = '73000000-0000-4000-8000-000000000202';
    await pg.exec(`insert into public.star_letters(id,post_id,author_id,body,created_at)
      values('${incomingA}','${post}','${other}','Cross session evidence',now()-interval '10 minutes'),
        ('${incomingB}','${post}','${other}','Second session incoming',now()-interval '10 minutes');
      update public.chia_star_letter_reply_budget_global set last_wake_at=null;
      update public.chia_star_letter_reply_budget_days set last_wake_at=null;`);
    sourceId = incomingA; claim = (await send('claim')).data;
    assert.equal(claim.outcome, 'claimed');
    assert.equal((await send('wake')).data.outcome, 'authorized');
    assert.equal((await send('complete','Session A grounded reply')).data.outcome, 'replied');
    const sessionA = claim;
    await pg.exec('update public.chia_star_letter_reply_budget_global set last_wake_at=null; update public.chia_star_letter_reply_budget_days set last_wake_at=null;');
    sourceId = incomingB; claim = (await send('claim')).data;
    assert.equal(claim.outcome, 'claimed');
    assert.equal((await send('wake')).data.outcome, 'authorized');
    const sessionB = claim;
    beforeComplete = async () => {
      sourceId = incomingA; claim = sessionA;
      try {
        assert.equal((await send('remember',JSON.stringify({memoryKey:'cross_session',evidenceQuote:'Cross session evidence'}))).data.outcome,'remembered');
      } finally { sourceId = incomingB; claim = sessionB; }
    };
    const cross = await send('complete','stale cross-session generated reply');
    assert.equal(cross.status, 409, JSON.stringify(cross));
    assert.equal(cross.data.code, 'stale_snapshot');
    assert.equal((await pg.query('select count(*)::int as n from public.star_letters where parent_star_letter_id=$1',[incomingB])).rows[0].n,0);
    console.log('GREEN: signed session A reply/remember invalidates session B completion atomically');
    // Keep revisions exact past Number.MAX_SAFE_INTEGER in JSON snapshots.
    await pg.query('update public.chia_person_memory_partitions set revision=9007199254740993 where chia_profile_id=$1 and person_profile_id=$2', [chia,human]);
    const large = await db.rpc('snapshot_chia_person_memory', {p_chia_profile_id:chia,p_person_profile_id:human});
    assert.equal(large.data.revision, '9007199254740993');
    // Revision metadata is server-read-only; the owner cannot restore an old revision or erase tombstones.
    for (const role of ['anon','authenticated','service_role']) {
      const acl = (await pg.query(`select has_table_privilege($1,'public.chia_person_memory_partitions','INSERT,UPDATE,DELETE,TRUNCATE') as writable`, [role])).rows[0];
      assert.equal(acl.writable, false, `${role} can forge revision`);
    }
    const rls = (await pg.query("select relrowsecurity from pg_class where oid='public.chia_person_memory_partitions'::regclass")).rows[0];
    assert.equal(rls.relrowsecurity, true);
  } finally { globalThis.fetch = originalFetch; }
}
