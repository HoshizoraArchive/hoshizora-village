/**
 * Build a proposed historical memory INSERT from an explicitly reviewed,
 * verbatim excerpt of the person's still-public post. This never writes data.
 * The database guard performs independent source/owner/revision checks.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const normalizeId = id => typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null;
const text = x => typeof x === 'string' ? x : '';
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;

export function prepareReviewedHistoricalPostMemory({ candidate, post, reviewedQuote, chiaProfileId, now = Date.now() } = {}) {
  const personId = normalizeId(candidate?.personProfileId);
  const postId = normalizeId(candidate?.sourceId);
  const chiaId = normalizeId(chiaProfileId);
  const sourceUpdate = time(candidate?.sourceUpdatedAt);
  if (!postId || !personId || !chiaId || chiaId === personId || !Number.isFinite(now)
    || candidate?.sourceType !== 'post' || candidate?.sourceKey !== `post:${postId}`
    || candidate?.postId !== postId || normalizeId(post?.id) !== postId ||
    normalizeId(post?.author_id) !== personId || post.visibility !== 'public' ||
    !Object.hasOwn(post,'deleted_at') || post.deleted_at !== null ||
    Number.isNaN(sourceUpdate) || time(post.updated_at) !== sourceUpdate || sourceUpdate > now) {
    return null;
  }
  const quote = text(reviewedQuote);
  if (quote !== quote.trim() || quote.length === 0 || [...quote].length > 500 ||
      quote.includes('\u0000') || /[\u0000-\u001f\u007f]/.test(quote) ||
      !text(post.body).includes(quote)) return null;
  // Only a literal quote, not inferred attributes/biography or media claims.
  return Object.freeze({
    chia_profile_id: chiaId,
    person_profile_id: personId,
    source_post_id: postId,
    source_updated_at: post.updated_at,
    memory_key: 'historical_post_' + postId.replaceAll('-',''),
    content: quote,
    importance: 2,
  });
}
