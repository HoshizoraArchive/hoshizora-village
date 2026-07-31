import { createHash, randomBytes, randomInt } from "node:crypto";
import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
import {
  PushHttpError,
  pushHttpError,
  pushJsonResponse,
  readPushSupabaseConfig,
} from "./_shared/pushNotifications.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

const PROTECTED_PROFILE_HASH_BUCKET_SIZE = 32;

export function hashProtectedProfileId(profileId) {
  const normalizedProfileId = String(profileId ?? "").trim().toLowerCase();

  if (!normalizedProfileId) {
    return "";
  }

  return createHash("sha256").update(normalizedProfileId, "utf8").digest("hex");
}

function shuffle(items, randomIndex = randomInt) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function createProtectedProfileHashPayload(
  profileIds,
  {
    randomHash = () => randomBytes(32).toString("hex"),
    randomIndex = randomInt,
  } = {},
) {
  const profileHashes = new Set(
    (profileIds ?? []).map(hashProtectedProfileId).filter(Boolean),
  );
  const paddedSize = Math.max(
    PROTECTED_PROFILE_HASH_BUCKET_SIZE,
    Math.ceil(profileHashes.size / PROTECTED_PROFILE_HASH_BUCKET_SIZE) *
      PROTECTED_PROFILE_HASH_BUCKET_SIZE,
  );

  while (profileHashes.size < paddedSize) {
    const decoyHash = String(randomHash() ?? "").trim().toLowerCase();

    if (/^[a-f0-9]{64}$/.test(decoyHash)) {
      profileHashes.add(decoyHash);
    }
  }

  return {
    profileHashes: shuffle(profileHashes, randomIndex),
  };
}

export async function readProtectedProfileIdsFromDatabase(supabase) {
  const [{ data: adminRows, error: adminError }, { data: guideTitle, error: titleError }] =
    await Promise.all([
      supabase.from("app_admins").select("user_id"),
      supabase
        .from("titles")
        .select("id")
        .eq("key", "celestial_guide")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (adminError || titleError) {
    throw pushHttpError(
      503,
      "BLACK_HOLE_PROTECTED_PROFILES_FAILED",
      "ブラックホールの保護対象を確認できませんでした。",
    );
  }

  let guideRows = [];

  if (guideTitle?.id) {
    const { data, error } = await supabase
      .from("profile_titles")
      .select("profile_id")
      .eq("title_id", guideTitle.id)
      .eq("is_primary", true);

    if (error) {
      throw pushHttpError(
        503,
        "BLACK_HOLE_PROTECTED_PROFILES_FAILED",
        "ブラックホールの保護対象を確認できませんでした。",
      );
    }

    guideRows = data ?? [];
  }

  return [
    ...(adminRows ?? []).map((row) => row.user_id),
    ...guideRows.map((row) => row.profile_id),
  ].filter(Boolean);
}

function toSafeError(error) {
  if (error instanceof PushHttpError) {
    return error;
  }

  if (error instanceof AiHttpError) {
    if (error.status === 401) {
      return pushHttpError(401, "INVALID_TOKEN", "ログイン情報を確認できませんでした。");
    }

    return pushHttpError(error.status, error.code, error.message);
  }

  return pushHttpError(
    503,
    "BLACK_HOLE_PROTECTED_PROFILES_FAILED",
    "ブラックホールの保護対象を確認できませんでした。",
  );
}

export default async function handler(request) {
  try {
    if (request.method !== "GET") {
      throw pushHttpError(405, "METHOD_NOT_ALLOWED", "この操作は許可されていません。");
    }

    const config = readPushSupabaseConfig();
    const supabase = createSupabaseAdminClient(config);
    await requireAuthenticatedUser({ request, supabase });

    const profileIds = await readProtectedProfileIdsFromDatabase(supabase);

    return pushJsonResponse(200, createProtectedProfileHashPayload(profileIds));
  } catch (error) {
    const safeError = toSafeError(error);

    return pushJsonResponse(safeError.status, {
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    });
  }
}

export const config = {
  path: "/api/black-hole-protected-profiles",
  method: ["GET"],
};
