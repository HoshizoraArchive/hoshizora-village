function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

const REVISION_READ_BATCH_SIZE = 100;

async function runChunkedReadRpc(client, name, argumentName, ids, options) {
  const batches = [];

  for (let index = 0; index < ids.length; index += REVISION_READ_BATCH_SIZE) {
    batches.push(ids.slice(index, index + REVISION_READ_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => runRpc(client, name, { [argumentName]: batch }, options)),
  );

  return results.flatMap((rows) => rows ?? []);
}

function withAbortSignal(query, signal) {
  if (signal && typeof query?.abortSignal === "function") {
    return query.abortSignal(signal);
  }

  return query;
}

async function runRpc(client, name, args, { signal } = {}) {
  const result = await withAbortSignal(client.rpc(name, args), signal);

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function readPostSnapshots(client, postIds, options = {}) {
  const ids = uniqueIds(postIds);

  if (ids.length === 0) {
    return [];
  }

  return runChunkedReadRpc(client, "get_post_snapshots_v1", "p_post_ids", ids, options);
}

export async function readPostEngagementSnapshots(client, postIds, options = {}) {
  const ids = uniqueIds(postIds);

  if (ids.length === 0) {
    return [];
  }

  return runChunkedReadRpc(client, "get_post_engagement_snapshots_v1", "p_post_ids", ids, options);
}

export async function readStarThreadSnapshots(client, postIds, options = {}) {
  const ids = uniqueIds(postIds);

  if (ids.length === 0) {
    return [];
  }

  return runChunkedReadRpc(client, "get_star_thread_snapshots_v1", "p_post_ids", ids, options);
}

export async function readArchivedPostSnapshots(client, knownPostIds = [], options = {}) {
  return (await runRpc(client, "get_archived_post_snapshots_v1", {
    p_known_post_ids: uniqueIds(knownPostIds),
  }, options)) ?? [];
}

export async function addPostResonance(client, postId, options = {}) {
  return firstRow(await runRpc(client, "add_post_resonance_v1", {
    p_post_id: postId,
    p_resonance_type: "sparkle",
  }, options));
}

export async function removePostResonance(client, resonanceId, options = {}) {
  return firstRow(await runRpc(client, "remove_post_resonance_v1", {
    p_resonance_id: resonanceId,
  }, options));
}

export async function setPostArchived(client, postId, archived, options = {}) {
  return firstRow(await runRpc(client, "set_post_archive_v1", {
    p_archived: Boolean(archived),
    p_post_id: postId,
  }, options));
}

export async function createRootStarLetter(client, { postId, body }, options = {}) {
  return firstRow(await runRpc(client, "create_star_letter_v2", {
    p_body: body,
    p_post_id: postId,
  }, options));
}

export async function createPost(client, {
  body,
  type,
  visibility = "public",
}, options = {}) {
  return firstRow(await runRpc(client, "create_post_v1", {
    p_body: body,
    p_type: type,
    p_visibility: visibility,
  }, options));
}

export async function updatePost(client, {
  postId,
  body,
  tagIds = [],
}, options = {}) {
  return firstRow(await runRpc(client, "update_post_v1", {
    p_body: body,
    p_post_id: postId,
    p_tag_ids: uniqueIds(tagIds),
  }, options));
}

export async function deletePost(client, postId, options = {}) {
  return firstRow(await runRpc(client, "delete_post_v1", {
    p_post_id: postId,
  }, options));
}

export async function insertPostAssets(client, {
  postId,
  mediaRows = [],
}, options = {}) {
  return firstRow(await runRpc(client, "insert_post_assets_v1", {
    p_media_rows: mediaRows,
    p_post_id: postId,
  }, options));
}

export async function replacePostTags(client, {
  postId,
  tagIds = [],
}, options = {}) {
  return firstRow(await runRpc(client, "replace_post_tags_v1", {
    p_post_id: postId,
    p_tag_ids: uniqueIds(tagIds),
  }, options));
}

export function mergeDiscoveredPostRows(discoveredRows = [], snapshots = []) {
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.post_id, snapshot]));

  return discoveredRows
    .map((row) => snapshotsById.get(row.id) ?? null)
    .filter(Boolean);
}
