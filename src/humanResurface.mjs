/**
 * Pure presentation-only mixing. Keeps *all* 20 recent visible posts,
 * adds at most 5 distinct recent human posts; does not mutate saved records.
 */
export function mixHumanResurfacePosts(recentRows, humanCandidates, {
  humanAuthorIds = new Set(), aiAuthorIds = new Set(), excludedPostIds = new Set(),
  blockedAuthorIds = new Set(), now = Date.now(), maxRecent = 20, maxInserted = 5,
  ageDays = 60, aiRunLimit = 3,
} = {}) {
  const valid = row => !!row && !!(row.id ?? row.post_id) && row.visibility === 'public' &&
    row.available !== false && row.tombstoned !== true && row.deleted_at == null &&
    !excludedPostIds.has(row.id ?? row.post_id) && !blockedAuthorIds.has(row.author_id);
  const base = (Array.isArray(recentRows) ? recentRows : []).filter(valid).slice(0, maxRecent);
  if (!base.length || !humanAuthorIds.size || !aiAuthorIds.size || !Array.isArray(humanCandidates)) return base;
  const existing = new Set(base.map(row => row.id ?? row.post_id));
  const featuredAuthors = new Set(base.filter(row => humanAuthorIds.has(row.author_id)).map(row => row.author_id));
  const floor = now - ageDays * 86400000;
  // A human post created after the base query must wait until the next normal
  // refresh, rather than being demoted underneath an older headline post.
  const anchorTime = Date.parse(base[0]?.created_at ?? '');
  const anchorId = String(base[0]?.id ?? base[0]?.post_id ?? '');
  if (!Number.isFinite(anchorTime)) return base;
  const eligible = humanCandidates.filter(row => {
    if (!valid(row) || !humanAuthorIds.has(row.author_id) || existing.has(row.id ?? row.post_id) || featuredAuthors.has(row.author_id)) return false;
    const stamp = Date.parse(row.created_at ?? '');
    if (!Number.isFinite(stamp) || stamp < floor || stamp > now) return false;
    if (stamp > anchorTime) return false;
    if (stamp === anchorTime && String(row.id ?? row.post_id).localeCompare(anchorId) > 0) return false;
    return true;
  }).sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) ||
    String(b.id ?? b.post_id).localeCompare(String(a.id ?? a.post_id)));
  const picks = [];
  for (const row of eligible) {
    if (featuredAuthors.has(row.author_id)) continue;
    featuredAuthors.add(row.author_id);
    picks.push(row);
    if (picks.length >= maxInserted) break;
  }
  if (!picks.length) return base;
  const output = []; let run = 0, next = 0;
  for (const row of base) {
    output.push(row);
    if (aiAuthorIds.has(row.author_id) && !humanAuthorIds.has(row.author_id)) run++;
    else run = 0; // unknown classification is NOT counted as an AI posting
    if (run >= aiRunLimit && next < picks.length) {
      output.push(picks[next++]);
      run = 0;
    }
  }
  return output; // length <= maxRecent + maxInserted; base rows preserved
}
