import { UUID_PATTERN } from './_shared/aiConfig.mjs';
import { ChiaDotStarLetterAuthError, verifyChiaDotStarLetterRequest } from './_shared/chiaDotStarLetterAuth.mjs';
import { discoverChiaDotStarLetters, checkChiaDotStarLetterClaimDue } from './_shared/chiaDotStarLetterDiscover.mjs';
import { rememberChiaDotStarLetter } from './_shared/chiaDotStarLetterRemember.mjs';
import { loadChiaDotStarLetterSnapshot } from './_shared/chiaDotStarLetterSnapshot.mjs';
import { createSupabaseAdminClient } from './_shared/supabaseAdmin.mjs';
const PROD_URL = 'https://dhfecpymvmursozfgjlr.supabase.co';
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const get = (env, key) => String(env(key) ?? '').trim();
export async function handleChiaDotStarLetter(request, context = {}, deps = {}) {
  const env = deps.readEnv ?? ((key) => Netlify.env.get(key));
  if (request.method !== 'POST') return json(405, { code: 'method_not_allowed' });
  if (context?.deploy?.context !== 'production' || context?.deploy?.published !== true || get(env, 'CHIA_DOT_STAR_LETTER_ENABLED') !== 'true') return json(404, { code: 'unavailable' });
  try {
    if (!(request.headers.get('content-type') ?? '').toLowerCase().split(';').some((v) => v.trim() === 'application/json')) return json(415, { code: 'unsupported_media_type' });
    if (Number(request.headers.get('content-length')) > 4096) return json(413, { code: 'content_too_large' });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return json(413, { code: 'content_too_large' });
    const signed = (deps.verifyRequest ?? verifyChiaDotStarLetterRequest)(JSON.parse(raw), { now: deps.now ?? Date.now() });
    const config = { supabaseUrl: get(env, 'SUPABASE_URL'), supabaseServiceRoleKey: get(env, 'SUPABASE_SERVICE_ROLE_KEY'), chiaProfileId: (get(env, 'CHIA_DAILY_METEOR_PROFILE_ID') || get(env, 'AI_HOSHIZORA_CHIA_PROFILE_ID')).toLowerCase(), founderProfileId: get(env, 'CHIA_FOUNDER_PROFILE_ID').toLowerCase() };
    if (config.supabaseUrl !== PROD_URL || !config.supabaseServiceRoleKey || !UUID_PATTERN.test(config.chiaProfileId) || (config.founderProfileId && !UUID_PATTERN.test(config.founderProfileId))) throw new Error('invalid_configuration');
    const db = (deps.createClient ?? createSupabaseAdminClient)(config);
    if (signed.action === 'discover') {
      const result = await (deps.discover ?? discoverChiaDotStarLetters)(db, { chiaProfileId: config.chiaProfileId, now: new Date(deps.now ?? Date.now()) });
      return json(200, result);
    }
    if (signed.action === 'claim') {
      const due = await (deps.checkDue ?? checkChiaDotStarLetterClaimDue)(db, { sourceId: signed.sourceId, chiaProfileId: config.chiaProfileId, now: new Date(deps.now ?? Date.now()) });
      if (!due.eligible) return json(200, { outcome: due.outcome });
      const { data, error } = await db.rpc('claim_chia_star_letter_reply_run', { p_source_star_letter_id: signed.sourceId, p_chia_profile_id: config.chiaProfileId });
      if (error) throw new Error('claim_failed');
      if (!data?.claimed) return json(200, { outcome: data?.outcome ?? 'not_claimed' });
      try {
        const snapshot = await (deps.loadSnapshot ?? loadChiaDotStarLetterSnapshot)(db, { sourceId: signed.sourceId, chiaProfileId: config.chiaProfileId, founderProfileId: config.founderProfileId });
        return json(200, { outcome: 'claimed', runId: data.run_id, claimToken: data.claim_token, attempts: data.attempts, ...snapshot });
      } catch (error) {
        await db.rpc('fail_chia_star_letter_reply_run', { p_run_id: data.run_id, p_error_code: 'snapshot_failed', p_claim_token: data.claim_token });
        throw error;
      }
    }
    // Read the current run and re-check the conversation before invoking the atomic completion RPC.
    const { data: run, error: runError } = await db.from('chia_star_letter_reply_runs').select('id,source_star_letter_id,status,attempts,claim_token').eq('id', signed.runId).maybeSingle();
    if (runError) throw new Error('run_lookup_failed');
    if (!run || run.source_star_letter_id !== signed.sourceId || run.attempts !== signed.attempts || run.claim_token !== signed.claimToken || (signed.action === 'remember' ? run.status !== 'replied' : run.status !== 'processing')) return json(409, { code: 'stale_run' });
    const current = await (deps.loadSnapshot ?? loadChiaDotStarLetterSnapshot)(db, { sourceId: signed.sourceId, chiaProfileId: config.chiaProfileId, founderProfileId: config.founderProfileId });
    if (current.snapshotHash !== signed.snapshotHash) return json(409, { code: 'stale_snapshot' });
    if (signed.action === 'remember') {
      const remembered = await (deps.remember ?? rememberChiaDotStarLetter)(db, { run, signed, chiaProfileId: config.chiaProfileId });
      if (remembered.outcome === 'invalid_memory_evidence') return json(422, { code: remembered.outcome });
      return json(200, remembered);
    }
    const result = await db.rpc(signed.action === 'complete' ? 'complete_chia_star_letter_reply_run' : 'fail_chia_star_letter_reply_run', signed.action === 'complete' ? { p_run_id: signed.runId, p_chia_profile_id: config.chiaProfileId, p_decision: signed.decision, p_body: signed.body, p_claim_token: signed.claimToken } : { p_run_id: signed.runId, p_error_code: 'dot_generation_failed', p_claim_token: signed.claimToken });
    if (result.error) throw new Error('finish_failed');
    if (result.data?.outcome === 'stale_claim' || result.data?.outcome === 'invalid_status') return json(409, { code: 'stale_run' });
    if (!['replied', 'already_replied', 'skipped', 'retryable_failed', 'failed'].includes(result.data?.outcome)) throw new Error('unexpected_finish_outcome');
    return json(200, { outcome: result.data?.outcome ?? 'unknown', replyStarLetterId: result.data?.reply_star_letter_id ?? null });
  } catch (error) {
    const status = error instanceof ChiaDotStarLetterAuthError ? error.status : error instanceof SyntaxError ? 400 : 503;
    return json(status, { code: status === 503 ? 'dot_star_letter_failed' : error.code ?? 'invalid_json' });
  }
}
export default (request, context) => handleChiaDotStarLetter(request, context);
export const config = { path: '/api/chia-dot-star-letter', method: ['POST'], rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 } };
