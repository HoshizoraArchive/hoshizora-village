import { isReplyDue } from './chiaStarLetterReply.mjs';
async function query(query, label) {
  const { data, error, count } = await query;
  if (error) throw new Error(`${label}_query_failed`);
  return { data: data ?? [], count: count ?? 0 };
}
export async function discoverChiaDotStarLetters(db, { chiaProfileId, now = new Date(), dailyLimit = 50, lookbackHours = 48, minDelaySeconds = 120, maxDelaySeconds = 300 }) {
  const since24 = new Date(now.getTime() - 86400000).toISOString();
  const count = await query(db.from('chia_star_letter_reply_runs').select('id', { count: 'exact', head: true }).eq('status', 'replied').gte('processed_at', since24), 'daily_count');
  if (count.count >= dailyLimit) return { outcome: 'daily_limit', sourceIds: [] };
  const since = new Date(now.getTime() - lookbackHours * 3600000).toISOString();
  const posts = (await query(db.from('posts').select('id').eq('author_id', chiaProfileId).is('deleted_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(50), 'posts')).data;
  if (!posts.length) return { outcome: 'no_candidate', sourceIds: [] };
  const letters = (await query(db.from('star_letters').select('id,author_id,created_at').in('post_id', posts.map((post) => post.id)).is('deleted_at', null).gte('created_at', since).order('created_at', { ascending: true }).limit(100), 'letters')).data;
  const due = letters.filter((letter) => letter.author_id !== chiaProfileId && isReplyDue({ sourceStarLetterId: letter.id, createdAt: letter.created_at, now, minDelaySeconds, maxDelaySeconds }));
  return { outcome: due.length ? 'candidates' : 'no_candidate', sourceIds: due.slice(0, Math.min(5, dailyLimit - count.count)).map((letter) => letter.id) };
}

export async function checkChiaDotStarLetterClaimDue(db, { sourceId, chiaProfileId, now = new Date(), dailyLimit = 50, lookbackHours = 48, minDelaySeconds = 120, maxDelaySeconds = 300 }) {
  const replied = await query(db.from('chia_star_letter_reply_runs').select('id', { count: 'exact', head: true }).eq('status', 'replied').gte('processed_at', new Date(now.getTime() - 86400000).toISOString()), 'daily_count');
  if (replied.count >= dailyLimit) return { eligible: false, outcome: 'daily_limit' };
  const source = (await query(db.from('star_letters').select('id,author_id,created_at').eq('id', sourceId).is('deleted_at', null).limit(1), 'claim_source')).data[0];
  if (!source || source.author_id === chiaProfileId) return { eligible: false, outcome: 'no_candidate' };
  if (Date.parse(source.created_at) < now.getTime() - lookbackHours * 3600000 || !isReplyDue({ sourceStarLetterId: source.id, createdAt: source.created_at, now, minDelaySeconds, maxDelaySeconds })) return { eligible: false, outcome: 'not_due' };
  return { eligible: true };
}
