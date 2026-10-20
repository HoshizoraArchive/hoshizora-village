import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signChiaDotStarLetterRequest, verifyChiaDotStarLetterRequest } from './chiaDotStarLetterAuth.mjs';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const id = '12345678-1234-4234-8234-123456789012';
const token = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
test('valid signed claim and complete are accepted', () => {
  const now = Date.now();
  const discover = signChiaDotStarLetterRequest({ action: 'discover', privateKey, now });
  assert.equal(verifyChiaDotStarLetterRequest(discover, { publicKey, now }).action, 'discover');
  const claim = signChiaDotStarLetterRequest({ action: 'claim', sourceId: id, privateKey, now });
  assert.equal(verifyChiaDotStarLetterRequest(claim, { publicKey, now }).sourceId, id);
  const complete = signChiaDotStarLetterRequest({ action: 'complete', sourceId: id, runId: id, claimToken: token, attempts: 1, snapshotHash: 'a'.repeat(64), decision: 'reply', body: 'こんにちは', privateKey, now });
  assert.equal(verifyChiaDotStarLetterRequest(complete, { publicKey, now }).claimToken, token);
  assert.throws(() => verifyChiaDotStarLetterRequest({ ...complete, body: 'tampered' }, { publicKey, now }));
  assert.throws(() => verifyChiaDotStarLetterRequest({ ...complete, attempts: 2 }, { publicKey, now }));
  assert.throws(() => verifyChiaDotStarLetterRequest(complete, { publicKey, now: now + 61000 }));
});


test('signed read-only status uses source identity without a mutable snapshot or lease', () => {
  const now = Date.now();
  const status = signChiaDotStarLetterRequest({ action: 'status', sourceId: id, privateKey, now });
  assert.equal(verifyChiaDotStarLetterRequest(status, { publicKey, now }).action, 'status');
  assert.throws(() => verifyChiaDotStarLetterRequest({ ...status, sourceId: token }, { publicKey, now }));
  assert.throws(() => verifyChiaDotStarLetterRequest({ ...status, body: 'write' }, { publicKey, now }));
});
