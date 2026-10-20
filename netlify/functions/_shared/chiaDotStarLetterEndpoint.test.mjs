import test from 'node:test';
import assert from 'node:assert/strict';
import { handleChiaDotStarLetter } from '../chia-dot-star-letter.mjs';
const id = '12345678-1234-4234-8234-123456789012';
const token = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
const snapshotHash = 'a'.repeat(64);
const envValues = {
  CHIA_DOT_STAR_LETTER_ENABLED: 'true',
  SUPABASE_URL: 'https://dhfecpymvmursozfgjlr.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only',
  CHIA_DAILY_METEOR_PROFILE_ID: id,
  CHIA_FOUNDER_PROFILE_ID: token,
};
const context = { deploy: { context: 'production', published: true } };
const request = (data) => new Request('http://localhost/api/chia-dot-star-letter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
function deps(verified, db, extra = {}) {
  return { readEnv: (key) => envValues[key], verifyRequest: () => verified, createClient: () => db, loadSnapshot: async () => ({ context: { sourceId: id, accountId: token }, snapshotHash, evidence: { memoryRevision: '7', sourceUpdatedAt: '2026-10-10T00:00:00Z', postUpdatedAt: '2026-10-09T00:00:00Z' } }), ...extra };
}
test('no privileged DB is contacted outside the published production deploy', async () => {
  let created = false;
  const res = await handleChiaDotStarLetter(request({}), { deploy: { context: 'deploy-preview', published: false } }, deps({}, null, { createClient: () => { created = true; } }));
  assert.equal(res.status, 404);
  assert.equal(created, false);
});
test('discover hands back candidates without claiming or writing', async () => {
  const res = await handleChiaDotStarLetter(request({}), context, deps({ action: 'discover' }, {}, { discover: async () => ({ outcome: 'candidates', sourceIds: [id] }) }));
  assert.deepEqual(await res.json(), { outcome: 'candidates', sourceIds: [id] });
});
test('claim returns a fenced run and bounded snapshot', async () => {
  const rpcCalls = [];
  const db = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { claimed: true, run_id: id, claim_token: token, attempts: 1, generation_invocation_id: token, memory_revision: '7' } }; } };
  const res = await handleChiaDotStarLetter(request({}), context, deps({ action: 'claim', sourceId: id }, db, { checkDue: async () => ({ eligible: true }) }));
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.claimToken, token);
  assert.equal(result.generationInvocationId, token);
  assert.equal(result.snapshotHash, snapshotHash);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'claim_chia_star_letter_reply_run');
});
test('claim rejects a not-yet-due source without calling the claim RPC', async () => {
  let claimed = false;
  const res = await handleChiaDotStarLetter(request({}), context, deps({ action: 'claim', sourceId: id }, { rpc: async () => { claimed = true; return {}; } }, { checkDue: async () => ({ eligible: false, outcome: 'not_due' }) }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).outcome, 'not_due');
  assert.equal(claimed, false);
});
test('completion passes token into fenced RPC and rejects stale attempts', async () => {
  const rpcCalls = [];
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, source_star_letter_id: id, status: 'processing', attempts: 2, claim_token: token } }) }) }) }), rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { outcome: 'replied', reply_star_letter_id: token } }; } };
  const payload = { action: 'complete', sourceId: id, runId: id, claimToken: token, attempts: 2, snapshotHash, decision: 'reply', body: 'お返事' };
  const result = await handleChiaDotStarLetter(request({}), context, deps(payload, db));
  assert.equal(result.status, 200);
  assert.equal(rpcCalls[0].args.p_claim_token, token);
  const stale = await handleChiaDotStarLetter(request({}), context, deps({ ...payload, attempts: 1 }, db));
  assert.equal(stale.status, 409);
  assert.equal(rpcCalls.length, 1);
});


test('status reconciles original reply read-only after source edits without loading a snapshot', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push({name,args}); return {data:{outcome:'replied',status:'replied',reply_star_letter_id:token,attempts:1}}; } };
  const response = await handleChiaDotStarLetter(request({}), context, deps({action:'status',sourceId:id}, db, { loadSnapshot: async () => { throw new Error('must_not_read_context'); } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).replyStarLetterId, token);
  assert.equal(calls[0].name, 'get_chia_star_letter_reply_run_status');
});

for (const status of ['replied','skipped','retryable_failed','failed']) test(`acknowledged ${status} reconciles complete/fail without false stale_run`, async () => {
  let writes=0;
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id,source_star_letter_id:id,status,attempts:1,claim_token:token,reply_star_letter_id:status==='replied'?token:null}})})})}),rpc:async()=>{writes++;throw new Error('duplicate_write');}};
  for(const action of ['complete','fail']) {
    const response=await handleChiaDotStarLetter(request({}),context,deps({action,sourceId:id,runId:id,claimToken:token,attempts:1,snapshotHash,decision:'reply',body:'reply'},db,{loadSnapshot:async()=>{throw new Error('must_not_read_context');}}));
    assert.equal(response.status,200);
    assert.equal((await response.json()).outcome,status);
  }
  assert.equal(writes,0);
});

test('fail releases a current lease even if snapshot/source became unavailable', async () => {
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id,source_star_letter_id:id,status:'processing',attempts:1,claim_token:token}})})})}),rpc:async(name)=>{assert.equal(name,'fail_chia_star_letter_reply_run');return {data:{outcome:'retryable_failed'}};}};
  const response=await handleChiaDotStarLetter(request({}),context,deps({action:'fail',sourceId:id,runId:id,claimToken:token,attempts:1,snapshotHash},db,{loadSnapshot:async()=>{throw new Error('source_deleted');}}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).outcome,'retryable_failed');
});

test('completion sends both observed revisions and propagates DB atomic freshness rejection', async () => {
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id,source_star_letter_id:id,status:'processing',attempts:1,claim_token:token}})})})}),rpc:async(name,args)=>{assert.equal(name,'complete_chia_star_letter_reply_run');assert.equal(args.p_source_updated_at,'2026-10-10T00:00:00Z');assert.equal(args.p_post_updated_at,'2026-10-09T00:00:00Z');return {data:{outcome:'stale_source'}};}};
  const response=await handleChiaDotStarLetter(request({}),context,deps({action:'complete',sourceId:id,runId:id,claimToken:token,attempts:1,snapshotHash,decision:'reply',body:'reply'},db));
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'stale_snapshot');
});

test('signed wake obtains a once-only DB authorization and does not generate in Netlify', async () => {
  let called=0;
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id,source_star_letter_id:id,status:'processing',attempts:1,claim_token:token}})})})}),rpc:async(name,args)=>{called++;assert.equal(name,'authorize_chia_dot_provider_wake');assert.equal(args.p_person_profile_id,token);return {data:{outcome:called===1?'authorized':'already_woken'}};}};
  const signed={action:'wake',sourceId:id,runId:id,claimToken:token,attempts:1,snapshotHash};
  assert.equal((await (await handleChiaDotStarLetter(request({}),context,deps(signed,db))).json()).outcome,'authorized');
  assert.equal((await (await handleChiaDotStarLetter(request({}),context,deps(signed,db))).json()).outcome,'already_woken');
});

test('status remains available to reconcile when write flag is disabled; writes remain disabled',async()=>{
  let calls=0;
  const extra={readEnv:(key)=>key==='CHIA_DOT_STAR_LETTER_ENABLED'?'false':envValues[key]};
  const db={rpc:async()=>{calls++;return {data:{outcome:'failed',status:'failed'}};}};
  const status=await handleChiaDotStarLetter(request({}),context,deps({action:'status',sourceId:id},db,extra));
  assert.equal(status.status,200);
  assert.equal((await status.json()).status,'failed');
  for (const action of ['claim','discover']) {
    const disabled = await handleChiaDotStarLetter(request({}),context,deps({action,sourceId:id},db,extra));
    assert.equal(disabled.status,404);
    assert.deepEqual(await disabled.json(),{code:'unavailable'});
  }
  assert.equal(calls,1);
});


test('claim rejects memory changed between DB claim and snapshot without returning stale context', async () => {
  const calls = [];
  const db = { rpc: async (name) => {
    calls.push(name);
    return { data: name === 'claim_chia_star_letter_reply_run' ? { claimed: true, run_id: id, claim_token: token, attempts: 1, memory_revision: '6' } : { outcome: 'retryable_failed' } };
  } };
  const response = await handleChiaDotStarLetter(request({}), context, deps({ action: 'claim', sourceId: id }, db, { checkDue: async () => ({ eligible: true }) }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'dot_star_letter_failed' });
  assert.deepEqual(calls, ['claim_chia_star_letter_reply_run','fail_chia_star_letter_reply_run']);
});

test('atomic partition revision rejection after snapshot recheck returns stale_snapshot', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, source_star_letter_id: id, status: 'processing', attempts: 1, claim_token: token } }) }) }) }),
    rpc: async () => ({ data: { outcome: 'stale_memory' } }) };
  const response = await handleChiaDotStarLetter(request({}), context, deps({ action: 'complete', sourceId: id, runId: id, claimToken: token, attempts: 1, snapshotHash, decision: 'reply', body: 'stale body' }, db));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: 'stale_snapshot' });
});
