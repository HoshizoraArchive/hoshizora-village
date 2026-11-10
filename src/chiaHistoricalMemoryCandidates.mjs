/**
 * Conservative, READ-ONLY discovery of historical evidence for Chia's per-person
 * memory. This code does not generate claims, write memories, or contact Supabase.
 *
 * Source types are deliberately explicit: the production memory table currently
 * requires a source_star_letter_id, so post evidence MUST NOT be written to that
 * column or disguised as a star letter. A future audited migration is required.
 */
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const asId = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
const isLive = row => row && Object.hasOwn(row, 'deleted_at') && row.deleted_at === null &&
  row.available !== false && row.tombstoned !== true;
const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
const recordTimeValid = (row, now) => {
  const created = timestamp(row?.created_at);
  const updated = timestamp(row?.updated_at);
  return Number.isFinite(created) && Number.isFinite(updated) && created <= now && updated <= now && updated >= created;
};
const sourceKey = (kind, id) => `${kind}:${id}`;

export function enumerateChiaHistoricalMemorySources({
  posts = [], starLetters = [], profileKinds = [], chiaProfileId,
  blockedPersonIds = new Set(), optedOutPersonIds = new Set(),
  excludedSourceKeys = new Set(), existingSourceKeys = new Set(),
  maxPerPerson = 30, now = Date.now(),
} = {}) {
  const chiaId = asId(chiaProfileId);
  if (!chiaId || !Array.isArray(posts) || !Array.isArray(starLetters) ||
      !Array.isArray(profileKinds) || !Number.isFinite(now) ||
      !Number.isSafeInteger(maxPerPerson) || maxPerPerson < 1 || maxPerPerson > 30) return [];

  const kinds = new Map();
  for (const kindRow of profileKinds) {
    const id = asId(kindRow?.profile_id);
    if (!id) continue;
    const kind = kindRow.kind;
    if (kinds.has(id) && kinds.get(id) !== kind) kinds.set(id, null);
    else if (!kinds.has(id)) kinds.set(id, kind);
  }
  if (kinds.get(chiaId) !== 'ai_resident') return []; // Never infer Chia's identity from name.
  const omitPerson = personId => !personId || personId === chiaId || kinds.get(personId) !== 'human' ||
    blockedPersonIds.has(personId) || optedOutPersonIds.has(personId);
  // A conflicting duplicate from multiple snapshots is not safe evidence.
  // Suppress that ID instead of depending on the array's last entry.
  const buildIndex = rows => {
    const map = new Map();
    for (const row of rows) {
      const id = asId(row?.id);
      if (!id) continue;
      if (map.has(id) && JSON.stringify(map.get(id)) !== JSON.stringify(row)) map.set(id, null);
      else if (!map.has(id)) map.set(id, row);
    }
    return map;
  };
  const byPostId = buildIndex(posts);
  const byLetterId = buildIndex(starLetters);

  const choices = [];
  const offer = (type, row, post, personId) => {
    if (omitPerson(personId) || !recordTimeValid(row, now)) return;
    const id = asId(row.id);
    const postId = asId(post.id);
    if (!id || !postId || !recordTimeValid(post, now)) return;
    const key = sourceKey(type, id);
    if (excludedSourceKeys.has(key) || existingSourceKeys.has(key)) return;
    choices.push({
      sourceType: type,
      sourceId: id,
      sourceKey: key,
      personProfileId: personId,
      postId,
      sourceUpdatedAt: row.updated_at,
      postUpdatedAt: post.updated_at,
      createdAt: row.created_at,
      // No body, inferred interests or identifying display names are exported.
      requiresMediaObservation: type === 'post' && !!(post.media_url || post.youtube_url),
    });
  };

  for (const post of byPostId.values()) {
    if (!isLive(post) || post.visibility !== 'public') continue;
    const personId = asId(post.author_id);
    if (!omitPerson(personId)) offer('post', post, post, personId);
  }
  for (const letter of byLetterId.values()) {
    if (!isLive(letter)) continue;
    const post = byPostId.get(asId(letter.post_id));
    if (!post || !isLive(post) || post.visibility !== 'public' || asId(post.author_id) !== chiaId) continue;
    const personId = asId(letter.author_id);
    if (omitPerson(personId)) continue;
    // Include only a top-level comment or a direct reply to a Chia-authored
    // letter. A reply to another human is not a conversation with Chia.
    const parentId = letter.parent_star_letter_id == null ? null : asId(letter.parent_star_letter_id);
    if (letter.parent_star_letter_id != null && !parentId) continue;
    if (parentId) {
      const parent = byLetterId.get(parentId);
      if (!parent || !isLive(parent) || asId(parent.post_id) !== asId(post.id) ||
          asId(parent.author_id) !== chiaId) continue;
    }
    offer('star_letter', letter, post, personId);
  }

  // Consistent selection across runs; newest evidence first within each person,
  // but no age cut-off so the historic beta posts are not discarded.
  choices.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) ||
    a.personProfileId.localeCompare(b.personProfileId) || a.sourceKey.localeCompare(b.sourceKey));
  const counts = new Map();
  const seen = new Set();
  const selected = [];
  for (const row of choices) {
    if (seen.has(row.sourceKey) || (counts.get(row.personProfileId) ?? 0) >= maxPerPerson) continue;
    seen.add(row.sourceKey);
    counts.set(row.personProfileId, (counts.get(row.personProfileId) ?? 0) + 1);
    selected.push(Object.freeze(row));
  }
  return selected;
}
