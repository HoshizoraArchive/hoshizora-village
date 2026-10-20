import { createHash, randomUUID, sign, verify } from 'node:crypto';
import { CHIA_DOT_METEOR_PUBLIC_KEY_PEM } from './chiaDotMeteorAuth.mjs';

const VERSION = 'chia-dot-star-letter.v1';
const ACTIONS = new Set(['discover', 'claim', 'status', 'wake', 'complete', 'fail', 'remember']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
export class ChiaDotStarLetterAuthError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (data) => [VERSION, data.action, data.sourceId, data.runId, data.claimToken, String(data.attempts), data.decision, data.bodyHash, data.snapshotHash, String(data.issuedAt), data.nonce].join('\n');
export function signChiaDotStarLetterRequest({ action, sourceId = '', runId = '', claimToken = '', attempts = 0, decision = '', body = '', snapshotHash = '', privateKey, now = Date.now(), nonce = randomUUID() }) {
  if (!privateKey || !ACTIONS.has(action)) throw new Error('invalid_signing_configuration');
  const data = { action, sourceId, runId, claimToken, attempts, decision, body, bodyHash: hash(body), snapshotHash, issuedAt: Math.floor(now / 1000), nonce };
  return { ...data, signature: sign(null, Buffer.from(canonical(data)), privateKey).toString('base64url') };
}
export function verifyChiaDotStarLetterRequest(data, { publicKey = CHIA_DOT_METEOR_PUBLIC_KEY_PEM, now = Date.now() } = {}) {
  const reject = () => { throw new ChiaDotStarLetterAuthError(403, 'invalid_signature_or_payload'); };
  if (!data || typeof data !== 'object' || Array.isArray(data)) reject();
  if (Object.keys(data).sort().join(',') !== ['action','attempts','body','bodyHash','claimToken','decision','issuedAt','nonce','runId','signature','snapshotHash','sourceId'].sort().join(',')) reject();
  if (!ACTIONS.has(data.action) || !Number.isSafeInteger(data.attempts) || data.attempts < 0 || data.attempts > 3 || !Number.isSafeInteger(data.issuedAt) || Math.floor(now / 1000) - data.issuedAt > 60 || data.issuedAt - Math.floor(now / 1000) > 5 || typeof data.nonce !== 'string' || !/^[\w.:-]{16,128}$/.test(data.nonce) || typeof data.body !== 'string' || Buffer.byteLength(data.body) > 2000 || !HASH.test(data.bodyHash) || hash(data.body) !== data.bodyHash || typeof data.signature !== 'string' || !/^[A-Za-z0-9_-]{80,120}$/.test(data.signature) || typeof data.sourceId !== 'string' || typeof data.runId !== 'string' || typeof data.claimToken !== 'string' || typeof data.snapshotHash !== 'string' || typeof data.decision !== 'string') reject();
  if ((['claim', 'status', 'discover'].includes(data.action)) ? ((data.action !== 'discover' ? !UUID.test(data.sourceId) : Boolean(data.sourceId)) || data.runId || data.claimToken || data.attempts !== 0 || data.decision || data.body || data.snapshotHash) : (!UUID.test(data.runId) || !UUID.test(data.claimToken) || !UUID.test(data.sourceId) || data.attempts < 1 || !HASH.test(data.snapshotHash) || (data.action === 'complete' ? !['reply','skip'].includes(data.decision) || (data.decision === 'reply' ? !data.body.trim() || data.body.length > 500 : Boolean(data.body)) : data.action === 'remember' ? Boolean(data.decision) || data.body.length > 1000 : Boolean(data.decision || data.body)))) reject();
  try { if (!verify(null, Buffer.from(canonical(data)), publicKey, Buffer.from(data.signature, 'base64url'))) reject(); } catch { reject(); }
  return data;
}
export { hash as hashChiaDotStarLetterContent };
