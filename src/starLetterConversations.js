const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAR_LETTER_MAX_LENGTH = 500;

const SUCCESS_OUTCOMES = Object.freeze({
  createReply: new Set(["created", "already_created"]),
  update: new Set(["updated"]),
  delete: new Set(["deleted", "soft_deleted", "already_deleted"]),
  resonate: new Set(["created", "already_created"]),
  archive: new Set(["archived", "unarchived", "already_unarchived"]),
});

function assertClient(client) {
  if (!client || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase client is required.");
  }
}

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
}

function normalizeBody(value) {
  if (typeof value !== "string") {
    throw new TypeError("Star letter body must be a string.");
  }

  const body = value.trim();

  if (!body || [...body].length > STAR_LETTER_MAX_LENGTH) {
    throw new RangeError(`Star letter body must be 1-${STAR_LETTER_MAX_LENGTH} characters.`);
  }

  return body;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function normalizeCount(value) {
  const count = Number(value ?? 0);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Star letter interaction count is invalid.");
  }

  return count;
}

async function runRpc(client, name, args, allowedOutcomes) {
  assertClient(client);
  const { data, error } = await client.rpc(name, args);

  if (error) {
    throw error;
  }

  const result = firstRow(data);

  if (!result || !allowedOutcomes.has(result.outcome)) {
    const outcomeError = new Error("Unexpected star-letter RPC outcome.");
    outcomeError.code = "STAR_LETTER_RPC_OUTCOME_INVALID";
    throw outcomeError;
  }

  return result;
}

export async function getStarLetterThread(client, postId) {
  assertClient(client);
  assertUuid(postId, "postId");

  const { data, error } = await client.rpc("get_star_letter_thread", {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ...row,
    is_deleted: Boolean(row.is_deleted),
    is_archived: Boolean(row.is_archived),
    total_resonance_count: normalizeCount(row.total_resonance_count),
    viewer_resonance_count: normalizeCount(row.viewer_resonance_count),
  }));
}

export async function createStarLetterReply(client, {
  parentStarLetterId,
  body,
  clientRequestId = crypto.randomUUID(),
}) {
  assertUuid(parentStarLetterId, "parentStarLetterId");
  assertUuid(clientRequestId, "clientRequestId");

  return runRpc(client, "create_star_letter_reply", {
    p_parent_star_letter_id: parentStarLetterId,
    p_body: normalizeBody(body),
    p_client_request_id: clientRequestId,
  }, SUCCESS_OUTCOMES.createReply);
}

export async function updateStarLetter(client, {
  starLetterId,
  body,
}) {
  assertUuid(starLetterId, "starLetterId");

  return runRpc(client, "update_star_letter", {
    p_star_letter_id: starLetterId,
    p_body: normalizeBody(body),
  }, SUCCESS_OUTCOMES.update);
}

export async function deleteStarLetter(client, starLetterId) {
  assertUuid(starLetterId, "starLetterId");

  return runRpc(client, "delete_star_letter", {
    p_star_letter_id: starLetterId,
  }, SUCCESS_OUTCOMES.delete);
}

export async function addStarLetterResonance(client, {
  starLetterId,
  resonanceType = "silent",
  clientRequestId = crypto.randomUUID(),
}) {
  assertUuid(starLetterId, "starLetterId");
  assertUuid(clientRequestId, "clientRequestId");

  return runRpc(client, "add_star_letter_resonance", {
    p_star_letter_id: starLetterId,
    p_client_request_id: clientRequestId,
    p_resonance_type: resonanceType,
  }, SUCCESS_OUTCOMES.resonate);
}

export async function setStarLetterArchived(client, {
  starLetterId,
  archived,
}) {
  assertUuid(starLetterId, "starLetterId");

  if (typeof archived !== "boolean") {
    throw new TypeError("archived must be a boolean.");
  }

  return runRpc(client, "set_star_letter_archive", {
    p_star_letter_id: starLetterId,
    p_archived: archived,
  }, SUCCESS_OUTCOMES.archive);
}
