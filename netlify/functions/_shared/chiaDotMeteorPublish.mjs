import { extractProfileMentionUsernames, syncAiResidentPostMentions } from "./aiResidentMentions.mjs";
import { runChiaDailyMeteor } from "./chiaDailyMeteorDispatch.mjs";

const MAX_POST_CHARACTERS = 500;
const MAX_MENTIONS = 1;
const PUBLISH_GROUNDING_MODES = new Set(["non_media", "media"]);

function responsePayload(response) {
  return response.clone().json().catch(() => ({}));
}

export function validateChiaDotMeteorBody(value) {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n?/g, "\n");
  if (
    body !== body.trim()
    || !body
    || Array.from(body).length > MAX_POST_CHARACTERS
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(body)
    || /https?:\/\/|www\./i.test(body)
    || /#[^\s#]+/u.test(body)
    || /\bAI\b|人工知能|生成しました|プロンプト/i.test(body)
  ) {
    return null;
  }

  const mentions = extractProfileMentionUsernames(body);
  const mentionTokenCount = body.match(/(^|[^A-Za-z0-9_])@[A-Za-z0-9_]{1,64}(?=$|[^A-Za-z0-9_])/gu)?.length ?? 0;
  if (mentions.length > MAX_MENTIONS || mentionTokenCount > MAX_MENTIONS) return null;
  return { body, mentions };
}

function assertQuery(error, code) {
  if (error) throw new Error(`${code}:${error.code ?? "unknown"}`);
}

export async function claimChiaDotMeteorRun(supabase, slotInfo) {
  const { data, error } = await supabase.rpc("claim_chia_daily_meteor_dot_run", {
    p_local_date: slotInfo.localDate,
    p_slot: slotInfo.slot,
    p_scheduled_for: slotInfo.scheduledFor,
  });
  assertQuery(error, "chia_dot_publish_claim_failed");
  return data;
}

export async function completeChiaDotMeteorRun({ supabase, runId, authorId, generated }) {
  const { data, error } = await supabase.rpc("complete_chia_daily_meteor_dot_run", {
    p_run_id: runId,
    p_author_id: authorId,
    p_body: generated.body,
    p_source: generated.source,
    p_error_code: generated.aiErrorCode,
  });
  assertQuery(error, "chia_dot_publish_completion_failed");
  if (!data?.post_id || data.outcome !== "posted") {
    throw new Error(`chia_dot_publish_completion_rejected:${data?.outcome ?? "unknown"}`);
  }
  return data;
}

export async function failChiaDotMeteorRun(supabase, runId, errorCode) {
  const { error } = await supabase.rpc("fail_chia_daily_meteor_dot_run", {
    p_run_id: runId,
    p_error_code: String(errorCode || "unknown").slice(0, 120),
  });
  if (error) {
    throw new Error(`chia_dot_publish_failure_mark_failed:${error.code ?? "unknown"}`);
  }
}

export async function validateChiaDotMeteorMentionTargets({
  supabase,
  chiaProfileId,
  mentions,
}) {
  if (!Array.isArray(mentions) || mentions.length === 0) return;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", mentions);
  assertQuery(profileError, "chia_dot_publish_mention_profiles_failed");

  const rows = profiles || [];
  if (rows.length !== mentions.length) {
    throw new Error("chia_dot_publish_invalid_mention_target");
  }

  const profileIds = rows.map((profile) => profile.id);
  const { data: kinds, error: kindError } = await supabase
    .from("profile_kinds")
    .select("profile_id, kind")
    .eq("kind", "human")
    .in("profile_id", profileIds);
  assertQuery(kindError, "chia_dot_publish_mention_kinds_failed");
  const humanIds = new Set((kinds || []).map((entry) => entry.profile_id));
  if (profileIds.some((profileId) => profileId === chiaProfileId || !humanIds.has(profileId))) {
    throw new Error("chia_dot_publish_invalid_mention_target");
  }

  const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] = await Promise.all([
    supabase
      .from("profile_blocks")
      .select("blocked_id")
      .eq("blocker_id", chiaProfileId)
      .in("blocked_id", profileIds),
    supabase
      .from("profile_blocks")
      .select("blocker_id")
      .eq("blocked_id", chiaProfileId)
      .in("blocker_id", profileIds),
  ]);
  assertQuery(outgoingError, "chia_dot_publish_blocks_failed");
  assertQuery(incomingError, "chia_dot_publish_blocks_failed");
  if ((outgoing || []).length > 0 || (incoming || []).length > 0) {
    throw new Error("chia_dot_publish_blocked_mention_target");
  }
}

export async function repairChiaDotMeteorMentions({
  supabase,
  slotInfo,
  chiaProfileId,
  syncMentions = syncAiResidentPostMentions,
}) {
  const { data: run, error } = await supabase
    .from("chia_daily_meteor_runs")
    .select("post_id, body, status, source")
    .eq("local_date", slotInfo.localDate)
    .eq("slot", slotInfo.slot)
    .maybeSingle();
  assertQuery(error, "chia_dot_publish_run_lookup_failed");
  if (!run || run.status !== "posted" || !run.post_id || !run.body) {
    throw new Error("chia_dot_publish_post_not_ready");
  }

  const mentionSync = await syncMentions({
    supabase,
    postId: run.post_id,
    actorProfileId: chiaProfileId,
    body: run.body,
  });
  return {
    postId: run.post_id,
    source: run.source,
    body: run.body,
    mentionCount: mentionSync.created,
    mentionedUsernames: mentionSync.usernames,
  };
}

function generatedDotBody(body) {
  return {
    body,
    source: "ai",
    aiErrorCode: null,
    discoveryAttempted: false,
    discoverySelected: false,
    discoveryCandidateSelected: false,
    discoveryCandidateUsername: null,
    discoveryGenerationSucceeded: false,
    discoveryTimedOut: false,
    discoveryFallbackToDaily: false,
  };
}

export async function publishChiaDotMeteor({
  supabase,
  slotInfo,
  body,
  chiaProfileId,
  requestId,
  allowedMentionUsernames = [],
  allowedMediaEvidenceKeys = [],
  mediaEvidenceKey = "",
  groundingMode = "",
  runDailyMeteor = runChiaDailyMeteor,
  claimRun = claimChiaDotMeteorRun,
  completeRun = completeChiaDotMeteorRun,
  markFailed = failChiaDotMeteorRun,
  validateMentionTargets = validateChiaDotMeteorMentionTargets,
  repairMentions = repairChiaDotMeteorMentions,
  info = console.log,
  warn = console.warn,
  errorLog = console.error,
}) {
  const validated = validateChiaDotMeteorBody(body);
  if (!validated) {
    return { status: 400, payload: { outcome: "rejected", code: "invalid_chia_dot_meteor_body", requestId } };
  }

  const mentionAllowSet = new Set(allowedMentionUsernames);
  if (validated.mentions.some((username) => !mentionAllowSet.has(username))) {
    return { status: 400, payload: { outcome: "rejected", code: "chia_dot_publish_mention_not_in_snapshot", requestId } };
  }
  const mediaAllowSet = new Set(allowedMediaEvidenceKeys);
  if (!PUBLISH_GROUNDING_MODES.has(groundingMode)) {
    return {
      status: 400,
      payload: {
        outcome: "rejected",
        code: "chia_dot_publish_invalid_grounding_mode",
        requestId,
      },
    };
  }
  if (
    (groundingMode === "media" && !mediaAllowSet.has(mediaEvidenceKey))
    || (groundingMode === "non_media" && mediaEvidenceKey)
  ) {
    return { status: 400, payload: { outcome: "rejected", code: "chia_dot_publish_ungrounded_media_claim", requestId } };
  }

  try {
    await validateMentionTargets({
      supabase,
      chiaProfileId,
      mentions: validated.mentions,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "invalid_mention_target";
    return { status: 400, payload: { outcome: "rejected", code, requestId } };
  }

  const response = await runDailyMeteor(slotInfo, {
    requestId,
    readRuntimeConfig: () => ({ enabled: true, chiaProfileId }),
    createSupabaseClient: () => supabase,
    claim: claimRun,
    complete: completeRun,
    markFailed,
    buildBody: async () => generatedDotBody(validated.body),
    info,
    warn,
    errorLog,
  });
  const runResult = await responsePayload(response);
  if (response.status >= 500) {
    return { status: response.status, payload: runResult };
  }
  if (!["posted", "already_handled"].includes(runResult.outcome)) {
    return {
      status: 503,
      payload: {
        outcome: "failed",
        code: `chia_dot_publish_unexpected_outcome:${runResult.outcome ?? "unknown"}`,
        requestId,
      },
    };
  }

  try {
    const repaired = await repairMentions({ supabase, slotInfo, chiaProfileId });
    if (runResult.outcome === "already_handled" && repaired.body !== validated.body) {
      return {
        status: 409,
        payload: {
          outcome: "conflict",
          code: "chia_dot_publish_existing_body_conflict",
          postId: repaired.postId,
          requestId,
        },
      };
    }
    return {
      status: 200,
      payload: {
        outcome: runResult.outcome,
        postId: repaired.postId,
        slot: slotInfo.slot,
        localDate: slotInfo.localDate,
        source: repaired.source,
        mentionCount: repaired.mentionCount,
        mentionedUsernames: repaired.mentionedUsernames,
        requestId,
      },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "mention_repair_failed";
    errorLog("chia_dot_meteor_mentions_pending", {
      requestId,
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      code,
    });
    return {
      status: 503,
      payload: {
        outcome: "mentions_pending",
        code,
        slot: slotInfo.slot,
        localDate: slotInfo.localDate,
        postId: runResult.postId ?? null,
        requestId,
      },
    };
  }
}
