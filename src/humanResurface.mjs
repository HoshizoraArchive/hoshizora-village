// Postgres timestamptz has microsecond precision; Date.parse keeps milliseconds
// only. Retain the final three digits so a new post is never demoted after an
// older headline when two posts are less than 1 ms apart.
export function postTimestampMicroseconds(value) {
  const timestamp = String(value ?? '');
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) return NaN;
  const digits = /\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(timestamp)?.[1] ?? '';
  const submillis = Number(digits.padEnd(6, '0').slice(3, 6));
  return milliseconds * 1000 + submillis;
}

export function comparePostsByCreatedAtDesc(a, b) {
  const left = postTimestampMicroseconds(a?.created_at);
  const right = postTimestampMicroseconds(b?.created_at);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return right - left;
  if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
  if (!Number.isFinite(right)) return -1;
  return String(b?.id ?? b?.post_id ?? '').localeCompare(String(a?.id ?? a?.post_id ?? ''));
}

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
  const floor = (now - ageDays * 86400000) * 1000;
  // Ignore candidates newer than the base headline until the next refresh.
  const anchorTime = postTimestampMicroseconds(base[0]?.created_at);
  if (!Number.isFinite(anchorTime)) return base;
  const eligible = humanCandidates.filter(row => {
    if (!valid(row) || !humanAuthorIds.has(row.author_id) || existing.has(row.id ?? row.post_id) || featuredAuthors.has(row.author_id)) return false;
    const stamp = postTimestampMicroseconds(row.created_at);
    return Number.isFinite(stamp) && stamp >= floor && stamp <= now * 1000 &&
      comparePostsByCreatedAtDesc(row, base[0]) >= 0;
  }).sort(comparePostsByCreatedAtDesc);
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
