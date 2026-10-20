import { isReplyDue } from './chiaStarLetterReply.mjs';
async function query(query, label) {
  const { data, error, count } = await query;
  if (error) throw new Error(`${label}_query_failed`);
  return { data: data ?? [], count: count ?? 0 };
}
// Eligibility is filtered before LIMIT inside the database. Terminal runs and
// cooling/still-owned leases must never consume a page ahead of eligible work.
// This is read-only: only the atomic claim RPC can reserve work or budget.
export async function discoverChiaDotStarLetters(db, { chiaProfileId, now = new Date(), lookbackHours = 48 }) {
  const since = new Date(now.getTime() - lookbackHours * 3600000).toISOString();
  const { data, error } = await db.rpc('discover_chia_star_letter_reply_candidates', {
    p_chia_profile_id: chiaProfileId, p_since: since, p_limit: 5,
    p_cursor_created_at: null, p_cursor_id: null,
  });
  if (error) throw new Error('discovery_query_failed');
  const sourceIds = [...new Set((data ?? []).map((entry) => entry.source_star_letter_id))].slice(0, 5);
  return { outcome: sourceIds.length ? 'candidates' : 'no_candidate', sourceIds };
}

export async function checkChiaDotStarLetterClaimDue(db, { sourceId, chiaProfileId, now = new Date(), dailyLimit = 50, lookbackHours = 48, minDelaySeconds = 120, maxDelaySeconds = 300 }) {
  const replied = await query(db.from('chia_star_letter_reply_runs').select('id', { count: 'exact', head: true }).eq('status', 'replied').gte('processed_at', new Date(now.getTime() - 86400000).toISOString()), 'daily_count');
  if (replied.count >= dailyLimit) return { eligible: false, outcome: 'daily_limit' };
  const source = (await query(db.from('star_letters').select('id,author_id,created_at').eq('id', sourceId).is('deleted_at', null).limit(1), 'claim_source')).data[0];
  if (!source || source.author_id === chiaProfileId) return { eligible: false, outcome: 'no_candidate' };
  if (Date.parse(source.created_at) < now.getTime() - lookbackHours * 3600000 || !isReplyDue({ sourceStarLetterId: source.id, createdAt: source.created_at, now, minDelaySeconds, maxDelaySeconds })) return { eligible: false, outcome: 'not_due' };
  return { eligible: true };
}
