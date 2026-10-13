import { UUID_PATTERN } from "./_shared/aiConfig.mjs";
import {
  ChiaDotMeteorAuthError,
  verifyChiaDotMeteorRequest,
} from "./_shared/chiaDotMeteorAuth.mjs";
import {
  publishChiaDotMeteor,
  repairChiaDotMeteorMentions,
} from "./_shared/chiaDotMeteorPublish.mjs";
import { hashChiaDotMeteorSnapshot, loadChiaDotMeteorSnapshot } from "./_shared/chiaDotMeteorSnapshot.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

const PRODUCTION_CONTEXT = "production";
const PRODUCTION_SUPABASE_URL = "https://dhfecpymvmursozfgjlr.supabase.co";
const AUTH_TTL_SECONDS = 60;
const REQUEST_BODY_MAX_BYTES = 4096;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isProductionInvocation(context) {
  return context?.deploy?.context === PRODUCTION_CONTEXT && context?.deploy?.published === true;
}

async function readSignedRequestBody(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().split(";").map((part) => part.trim()).includes("application/json")) {
    throw new ChiaDotMeteorAuthError(415, "unsupported_media_type");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > REQUEST_BODY_MAX_BYTES) {
    throw new ChiaDotMeteorAuthError(413, "content_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > REQUEST_BODY_MAX_BYTES) {
    throw new ChiaDotMeteorAuthError(413, "content_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ChiaDotMeteorAuthError(400, "bad_json");
  }
}

function toSafeError(error) {
  if (error instanceof ChiaDotMeteorAuthError) {
    return { status: error.status, code: error.code };
  }
  if (error && typeof error === "object" && Number.isInteger(error.status)) {
    return {
      status: error.status,
      code: typeof error.code === "string" ? error.code.slice(0, 120) : "invalid_request",
    };
  }
  return { status: 503, code: "chia_dot_meteor_failed" };
}

function readConfig(readEnv) {
  if (
    String(readEnv("CHIA_DOT_METEOR_ENABLED") ?? "").trim() !== "true"
    || String(readEnv("CHIA_DAILY_METEOR_ENABLED") ?? "").trim() !== "true"
  ) {
    return { enabled: false };
  }
  const supabaseUrl = String(readEnv("SUPABASE_URL") ?? "").trim();
  const supabaseServiceRoleKey = String(readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const chiaProfileId = String(
    readEnv("CHIA_DAILY_METEOR_PROFILE_ID")
    || readEnv("AI_HOSHIZORA_CHIA_PROFILE_ID")
    || "",
  ).trim().toLowerCase();
  if (
    supabaseUrl !== PRODUCTION_SUPABASE_URL
    || !supabaseServiceRoleKey
    || !UUID_PATTERN.test(chiaProfileId)
  ) {
    throw new Error("invalid_chia_dot_meteor_configuration");
  }
  return { enabled: true, supabaseUrl, supabaseServiceRoleKey, chiaProfileId };
}

export async function handleChiaDotMeteor(request, context = {}, dependencies = {}) {
  const {
    now = Date.now(),
    readEnv = (name) => Netlify.env.get(name),
    createClient = createSupabaseAdminClient,
    verifyRequest = verifyChiaDotMeteorRequest,
    loadSnapshot = loadChiaDotMeteorSnapshot,
    publish = publishChiaDotMeteor,
    repairMentions = repairChiaDotMeteorMentions,
    info = console.log,
    warn = console.warn,
    errorLog = console.error,
  } = dependencies;
  const requestId = context.requestId ?? crypto.randomUUID();

  if (request.method !== "POST") {
    return jsonResponse(405, { outcome: "rejected", code: "method_not_allowed", requestId });
  }
  if (!isProductionInvocation(context)) {
    return jsonResponse(404, { outcome: "unavailable", requestId });
  }

  try {
    const config = readConfig(readEnv);
    if (!config.enabled) {
      return jsonResponse(404, { outcome: "unavailable", requestId });
    }

    const verified = verifyRequest(await readSignedRequestBody(request), {
      ttlSeconds: AUTH_TTL_SECONDS,
      now,
    });
    if (verified.action !== "publish" && verified.body !== "") {
      return jsonResponse(400, {
        outcome: "rejected",
        code: "invalid_chia_dot_meteor_control_body",
        requestId,
      });
    }

    const supabase = createClient(config);
    if (verified.action === "snapshot") {
      const snapshot = await loadSnapshot({
        supabase,
        slotInfo: verified.slotInfo,
        chiaProfileId: config.chiaProfileId,
        now: new Date(now),
      });
      return jsonResponse(200, {
        outcome: "snapshot",
        snapshot,
        snapshotHash: hashChiaDotMeteorSnapshot(snapshot),
        requestId,
      });
    }

    if (verified.action === "repair") {
      try {
        const repaired = await repairMentions({
          supabase,
          slotInfo: verified.slotInfo,
          chiaProfileId: config.chiaProfileId,
        });
        return jsonResponse(200, {
          outcome: "repaired",
          ...repaired,
          slot: verified.slotInfo.slot,
          localDate: verified.slotInfo.localDate,
          requestId,
        });
      } catch {
        return jsonResponse(503, { outcome: "repair_pending", requestId });
      }
    }

    const currentSnapshot = await loadSnapshot({
      supabase,
      slotInfo: verified.slotInfo,
      chiaProfileId: config.chiaProfileId,
      now: new Date(now),
    });
    if (hashChiaDotMeteorSnapshot(currentSnapshot) !== verified.snapshotHash) {
      return jsonResponse(409, { outcome: "rejected", code: "stale_chia_dot_meteor_snapshot", requestId });
    }
    const recentMentioned = new Set(currentSnapshot.recentMentionHistory.map((entry) => entry.username));
    const allowedMentionUsernames = [...new Set([
      ...currentSnapshot.recentPublicMeteors.map((entry) => entry.author.username),
      ...currentSnapshot.observedMeteors.map((entry) => entry.author.username),
    ])].filter((username) => !recentMentioned.has(username));
    const allowedMediaEvidenceKeys = currentSnapshot.observedMeteors
      .filter((entry) => entry.mediaObserved)
      .map((entry) => entry.evidenceKey);

    const result = await publish({
      supabase,
      slotInfo: verified.slotInfo,
      body: verified.body,
      chiaProfileId: config.chiaProfileId,
      requestId,
      allowedMentionUsernames,
      allowedMediaEvidenceKeys,
      mediaEvidenceKey: verified.mediaEvidenceKey,
      groundingMode: verified.groundingMode,
      warn,
      errorLog,
    });
    if (result.status < 500) {
      info("chia_dot_meteor_publish_result", {
        requestId,
        slot: verified.slotInfo.slot,
        localDate: verified.slotInfo.localDate,
        outcome: result.payload?.outcome ?? "unknown",
        postId: result.payload?.postId ?? null,
      });
    }
    return jsonResponse(result.status, result.payload);
  } catch (error) {
    const safeError = toSafeError(error);
    const log = safeError.status >= 500 ? errorLog : warn;
    log("chia_dot_meteor_rejected", {
      requestId,
      status: safeError.status,
      code: safeError.code,
    });
    return jsonResponse(safeError.status, {
      outcome: "rejected",
      code: safeError.code,
      requestId,
    });
  }
}

export default async function handler(request, context) {
  return handleChiaDotMeteor(request, context);
}

export const config = {
  path: "/api/chia-dot-meteor",
  method: ["POST"],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowLimit: 30,
    windowSize: 60,
  },
};
