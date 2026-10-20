import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createChiaPersonGenerationRequest } from '../netlify/functions/_shared/chiaPersonGenerationContract.mjs';
import { signChiaDotStarLetterRequest } from '../netlify/functions/_shared/chiaDotStarLetterAuth.mjs';
const usage = 'node scripts/chia-dot-star-letter-client.mjs discover [--endpoint URL] | prepare --snapshot-file FILE --output FILE | status --source-id UUID [--output FILE] | claim --source-id UUID --output FILE [--endpoint URL] | complete --snapshot-file FILE --decision reply|skip [--body-file FILE] [--endpoint URL] | wake --snapshot-file FILE | fail --snapshot-file FILE | remember --snapshot-file FILE --body-file evidence.json';
function options(argv) {
  const [action, ...rest] = argv;
  if (!['discover','claim','prepare','status','wake','complete','fail','remember'].includes(action)) throw new Error(usage);
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!/^--[a-z-]+$/.test(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(usage);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { action, flags };
}
async function main() {
  const { action, flags } = options(process.argv.slice(2));
  if (action === 'prepare') {
    if (!flags.output || !flags['snapshot-file']) throw new Error('prepare_files_required');
    const snapshot = JSON.parse(readFileSync(flags['snapshot-file'], 'utf8'));
    if (snapshot.outcome !== 'claimed') throw new Error('invalid_claim_snapshot');
    const input = createChiaPersonGenerationRequest(snapshot, snapshot.generationBudget);
    writeFileSync(flags.output, JSON.stringify(input, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({ outcome: 'prepared' }) + '\n');
    return;
  }
  if (action === 'claim' && !flags.output) throw new Error('claim_output_file_required');
  const endpoint = flags.endpoint || process.env.CHIA_DOT_STAR_LETTER_ENDPOINT || 'https://hoshizora-village.netlify.app/api/chia-dot-star-letter';
  if (!/^https:\/\//.test(endpoint) && !/^http:\/\/localhost(?::\d+)?\//.test(endpoint)) throw new Error('invalid_endpoint');
  const keyPath = flags['private-key'] || process.env.CHIA_DOT_METEOR_PRIVATE_KEY_PATH || resolve(process.cwd(), '../../.secrets/chia-dot-meteor-ed25519.pem');
  const key = readFileSync(keyPath, 'utf8');
  const snapshot = ['claim', 'discover', 'status'].includes(action) ? null : JSON.parse(readFileSync(flags['snapshot-file'], 'utf8'));
  if (!['claim', 'discover', 'status'].includes(action) && (snapshot?.outcome !== 'claimed' || !snapshot?.claimToken || !snapshot?.snapshotHash)) throw new Error('invalid_claim_snapshot');
  const body = action === 'remember' ? readFileSync(flags['body-file'], 'utf8') : action === 'complete' && flags.decision === 'reply' ? readFileSync(flags['body-file'], 'utf8').replace(/\r\n?/g, '\n').trim() : '';
  const signed = signChiaDotStarLetterRequest({ action, sourceId: ['claim','status'].includes(action) ? flags['source-id'] : action === 'discover' ? '' : snapshot.context.sourceId, runId: snapshot?.runId, claimToken: snapshot?.claimToken, attempts: snapshot?.attempts, snapshotHash: snapshot?.snapshotHash, decision: action === 'complete' ? flags.decision : '', body, privateKey: key });
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`dot_star_letter_http_${response.status}:${data.code ?? 'unknown'}`);
  if (flags.output) writeFileSync(flags.output, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const safe = { outcome: data.outcome ?? 'unknown' };
  if (Array.isArray(data.sourceIds)) safe.sourceIds = data.sourceIds;
  if (typeof data.runId === 'string') safe.runId = data.runId;
  if (typeof data.attempts === 'number') safe.attempts = data.attempts;
  if (typeof data.replyStarLetterId === 'string') safe.replyStarLetterId = data.replyStarLetterId;
  if (typeof data.generationInvocationId === 'string') safe.generationInvocationId = data.generationInvocationId;
  if (typeof data.providerWakeAt === 'string') safe.providerWakeAt = data.providerWakeAt;
  if (typeof data.nextAttemptAt === 'string') safe.nextAttemptAt = data.nextAttemptAt;
  process.stdout.write(JSON.stringify(safe) + '\n');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
