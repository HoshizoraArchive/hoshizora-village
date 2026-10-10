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
  return { readEnv: (key) => envValues[key], verifyRequest: () => verified, createClient: () => db, loadSnapshot: async () => ({ context: { sourceId: id, accountId: token }, snapshotHash }), ...extra };
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
  const db = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { claimed: true, run_id: id, claim_token: token, attempts: 1 } }; } };
  const res = await handleChiaDotStarLetter(request({}), context, deps({ action: 'claim', sourceId: id }, db, { checkDue: async () => ({ eligible: true }) }));
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.claimToken, token);
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
