import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
import {
  PushHttpError,
  pushHttpError,
  pushJsonResponse,
  readPushSupabaseConfig,
} from "./_shared/pushNotifications.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

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

    const profileIds = [
      ...(adminRows ?? []).map((row) => row.user_id),
      ...guideRows.map((row) => row.profile_id),
    ].filter(Boolean);

    return pushJsonResponse(200, {
      profileIds: [...new Set(profileIds)],
    });
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
