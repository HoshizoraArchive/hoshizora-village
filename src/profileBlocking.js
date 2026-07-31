export const BLACK_HOLE_SUCCESS_MESSAGE = "ブラックホールに送りました。";
export const BLACK_HOLE_ERROR_MESSAGE =
  "ブラックホールへ送れませんでした。時間をおいてもう一度試してください。";
export const BLACK_HOLE_RESTORE_ERROR_MESSAGE =
  "ブラックホールから戻せませんでした。時間をおいてもう一度試してください。";

const PROTECTED_PROFILE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_INITIAL_HASH = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

let trustedProtectedProfileHashes = new Set();
let protectedProfileLookupState = "unavailable";

function normalizeProfileId(profileId) {
  return String(profileId ?? "").trim().toLowerCase();
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export function hashProtectedProfileId(profileId) {
  const normalizedProfileId = normalizeProfileId(profileId);

  if (!normalizedProfileId) {
    return "";
  }

  const bytes = new TextEncoder().encode(normalizedProfileId);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = [...SHA256_INITIAL_HASH];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15];
      const word2 = words[index - 2];
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const upperSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + upperSigma1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const upperSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (upperSigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

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

export function createProtectedProfileHashSet(profileHashes) {
  return new Set(
    Array.from(profileHashes ?? [])
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter((value) => PROTECTED_PROFILE_HASH_PATTERN.test(value)),
  );
}

export function setTrustedProtectedProfileHashes(profileHashes) {
  trustedProtectedProfileHashes = createProtectedProfileHashSet(profileHashes);
  protectedProfileLookupState = "ready";
  return trustedProtectedProfileHashes;
}

export function setProtectedProfileLookupUnavailable() {
  trustedProtectedProfileHashes = new Set();
  protectedProfileLookupState = "unavailable";
}

export function getProtectedProfileLookupState() {
  return protectedProfileLookupState;
}

export function isTrustedProtectedProfile(profile) {
  if (profile?.primaryTitle?.key === "celestial_guide") {
    return true;
  }

  const profileId = profile?.id ?? profile?.authorId ?? null;

  if (!profileId) {
    return false;
  }

  if (protectedProfileLookupState !== "ready") {
    return true;
  }

  return trustedProtectedProfileHashes.has(hashProtectedProfileId(profileId));
}

export function createBlockedProfileIdSet(rows) {
  return new Set((rows ?? []).map((row) => row?.blocked_id).filter(Boolean));
}

export async function readProtectedProfileHashes(client, fetchImpl = globalThis.fetch) {
  if (!client?.auth?.getSession || typeof fetchImpl !== "function") {
    throw new Error("BLACK_HOLE_PROTECTED_PROFILES_UNAVAILABLE");
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  const accessToken = data?.session?.access_token;

  if (!accessToken) {
    throw new Error("BLACK_HOLE_PROTECTED_PROFILES_UNAVAILABLE");
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

  if (
    !Array.isArray(payload?.profileHashes) ||
    payload.profileHashes.length < 1 ||
    payload.profileHashes.some(
      (value) =>
        !PROTECTED_PROFILE_HASH_PATTERN.test(String(value ?? "").trim().toLowerCase()),
    )
  ) {
    throw new Error("BLACK_HOLE_PROTECTED_PROFILES_INVALID_RESPONSE");
  }

  return createProtectedProfileHashSet(payload.profileHashes);
}

export async function readBlockedProfileIds(client, fetchImpl = globalThis.fetch) {
  protectedProfileLookupState = "loading";
  trustedProtectedProfileHashes = new Set();

  const protectedHashesResultPromise = readProtectedProfileHashes(client, fetchImpl).then(
    (profileHashes) => ({ ok: true, profileHashes }),
    (error) => ({ ok: false, error }),
  );
  const { data, error } = await client.from("profile_blocks").select("blocked_id");

  if (error) {
    setProtectedProfileLookupUnavailable();
    throw error;
  }

  const protectedHashesResult = await protectedHashesResultPromise;

  if (protectedHashesResult.ok) {
    setTrustedProtectedProfileHashes(protectedHashesResult.profileHashes);
  } else {
    setProtectedProfileLookupUnavailable();
  }

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
