export const BLACK_HOLE_SUCCESS_MESSAGE = "ブラックホールに送りました。";
export const BLACK_HOLE_ERROR_MESSAGE =
  "ブラックホールへ送れませんでした。時間をおいてもう一度試してください。";
export const BLACK_HOLE_RESTORE_ERROR_MESSAGE =
  "ブラックホールから戻せませんでした。時間をおいてもう一度試してください。";

let trustedProtectedProfileIds = new Set();

export function isMissingProfileBlocksSchemaError(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    message.includes("profile_blocks") ||
    message.includes("block_profile") ||
    message.includes("unblock_profile") ||
    message.includes("get_my_profile_blocks")
  );
}

export function createProtectedProfileIdSet(profileIds) {
  return new Set((profileIds ?? []).filter(Boolean));
}

export function setTrustedProtectedProfileIds(profileIds) {
  trustedProtectedProfileIds = createProtectedProfileIdSet(profileIds);
  return trustedProtectedProfileIds;
}

export function isTrustedProtectedProfile(profile) {
  const profileId = profile?.id ?? profile?.authorId ?? null;

  return (
    profile?.primaryTitle?.key === "celestial_guide" ||
    Boolean(profileId && trustedProtectedProfileIds.has(profileId))
  );
}

export function createBlockedProfileIdSet(rows) {
  return new Set((rows ?? []).map((row) => row?.blocked_id).filter(Boolean));
}

export async function readProtectedProfileIds(client, fetchImpl = globalThis.fetch) {
  if (!client?.auth?.getSession || typeof fetchImpl !== "function") {
    return new Set();
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  const accessToken = data?.session?.access_token;

  if (!accessToken) {
    return new Set();
  }

  const response = await fetchImpl("/api/black-hole-protected-profiles", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("BLACK_HOLE_PROTECTED_PROFILES_FAILED");
  }

  const payload = await response.json();
  return createProtectedProfileIdSet(payload?.profileIds);
}

export async function readBlockedProfileIds(client) {
  const protectedIdsPromise = readProtectedProfileIds(client).catch(() => new Set());
  const { data, error } = await client.from("profile_blocks").select("blocked_id");

  if (error) {
    throw error;
  }

  setTrustedProtectedProfileIds(await protectedIdsPromise);
  return createBlockedProfileIdSet(data);
}

export async function readMyProfileBlocks(client) {
  const { data, error } = await client.rpc("get_my_profile_blocks");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    avatarUrl: row.avatar_url ?? null,
    blockId: row.block_id,
    blockedId: row.blocked_id,
    createdAt: row.created_at,
    displayName: row.display_name || "村人さん",
    username: row.username || "",
  }));
}

function getRpcRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

export async function blockProfile(client, targetProfileId) {
  const { data, error } = await client.rpc("block_profile", {
    p_target_profile_id: targetProfileId,
  });

  if (error) {
    throw error;
  }

  const result = getRpcRow(data);

  if (!["blocked", "already_blocked"].includes(result?.outcome)) {
    throw new Error("BLACK_HOLE_NOT_ALLOWED");
  }

  return result;
}

export async function unblockProfile(client, targetProfileId) {
  const { data, error } = await client.rpc("unblock_profile", {
    p_target_profile_id: targetProfileId,
  });

  if (error) {
    throw error;
  }

  const result = getRpcRow(data);

  if (!["unblocked", "already_unblocked"].includes(result?.outcome)) {
    throw new Error("BLACK_HOLE_RESTORE_NOT_ALLOWED");
  }

  return result;
}

export function isProfileBlocked(blockedProfileIds, profileId) {
  return Boolean(profileId && blockedProfileIds?.has(profileId));
}

export function excludeBlockedProfiles(items, blockedProfileIds, getProfileId) {
  if (!blockedProfileIds?.size) {
    return items;
  }

  return (items ?? []).filter((item) => !isProfileBlocked(blockedProfileIds, getProfileId(item)));
}
