import { GoogleGenAI } from "@google/genai";
import { readEnv, UUID_PATTERN } from "./_shared/aiConfig.mjs";
import { syncAiResidentPostMentions } from "./_shared/aiResidentMentions.mjs";
import {
  buildChiaAiPrompt,
  buildCuratedLunchBody,
  buildFallbackBody,
  CHIA_DAILY_METEOR_OUTPUT_SCHEMA,
  CHIA_DAILY_METEOR_SCHEDULE,
  parseChiaAiOutput,
  resolveChiaDailyMeteorSlot,
} from "./_shared/chiaDailyMeteor.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

const DEFAULT_AI_TIMEOUT_MS = 15000;
const SUPPORTED_SLOTS = new Set(["morning", "noon", "evening"]);

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readPositiveInteger(name, fallback) {
  const rawValue = readEnv(name).trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function readConfig() {
  const enabled = readEnv("CHIA_DAILY_METEOR_ENABLED").trim() === "true";

  if (!enabled) {
    return { enabled: false };
  }

  const supabaseUrl = readEnv("SUPABASE_URL").trim();
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY").trim();
  const chiaProfileId = (
    readEnv("CHIA_DAILY_METEOR_PROFILE_ID").trim() ||
    readEnv("AI_HOSHIZORA_CHIA_PROFILE_ID").trim()
  ).toLowerCase();
  const geminiApiKey = readEnv("GEMINI_API_KEY").trim();
  const model = readEnv("AI_OBSERVATION_MODEL").trim();

  if (!supabaseUrl || !supabaseServiceRoleKey || !UUID_PATTERN.test(chiaProfileId)) {
    throw new Error("invalid_chia_daily_meteor_configuration");
  }

  return {
    enabled: true,
    supabaseUrl,
    supabaseServiceRoleKey,
    chiaProfileId,
    geminiApiKey,
    model,
    aiTimeoutMs: readPositiveInteger("CHIA_DAILY_METEOR_AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
  };
}

async function claimRun(supabase, slotInfo) {
  const { data, error } = await supabase.rpc("claim_chia_daily_meteor_run", {
    p_local_date: slotInfo.localDate,
    p_slot: slotInfo.slot,
    p_scheduled_for: slotInfo.scheduledFor,
  });

  if (error) {
    throw new Error(`claim_failed:${error.code ?? "unknown"}`);
  }

  return data;
}

async function markRunFailed(supabase, runId, errorCode) {
  if (!runId) {
    return;
  }

  await supabase
    .from("chia_daily_meteor_runs")
    .update({
      status: "failed",
      error_code: String(errorCode || "unknown").slice(0, 120),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "processing");
}

async function completeRun({ supabase, runId, authorId, generated }) {
  const { data, error } = await supabase.rpc("complete_chia_daily_meteor_run", {
    p_run_id: runId,
    p_author_id: authorId,
    p_body: generated.body,
    p_source: generated.source,
    p_error_code: generated.aiErrorCode,
  });

  if (error) {
    throw new Error(`completion_failed:${error.code ?? "unknown"}`);
  }

  if (!data?.post_id || !["posted", "already_posted"].includes(data.outcome)) {
    throw new Error(`completion_rejected:${data?.outcome ?? "unknown"}`);
  }

  return data;
}

async function generateAiBody(config, slotInfo) {
  if (!config.geminiApiKey || !config.model) {
    throw new Error("ai_not_configured");
  }

  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const interaction = await client.interactions.create(
    {
      model: config.model,
      system_instruction: [
        "あなたは星空Villageの案内人、星空ちあです。",
        "バズや数字ではなく、一人の心へ光を届けるために話します。",
        "指定されたJSON以外は返さないでください。",
      ].join("\n"),
      input: [{ type: "text", text: buildChiaAiPrompt(slotInfo) }],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: CHIA_DAILY_METEOR_OUTPUT_SCHEMA,
      },
      tools: [],
      store: false,
    },
    {
      retries: { strategy: "none" },
      timeout_ms: config.aiTimeoutMs,
    },
  );

  const body = parseChiaAiOutput(
    interaction?.output_text ?? interaction?.outputText ?? "",
    slotInfo.slot,
  );

  if (!body) {
    throw new Error("ai_output_invalid");
  }

  return body;
}

async function buildPostBody(config, slotInfo) {
  if (slotInfo.slot === "noon") {
    return {
      body: buildCuratedLunchBody(slotInfo.localDate),
      source: "curated",
      aiErrorCode: null,
    };
  }

  try {
    return {
      body: await generateAiBody(config, slotInfo),
      source: "ai",
      aiErrorCode: null,
    };
  } catch (error) {
    console.warn("chia_daily_meteor_ai_fallback", {
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });

    return {
      body: buildFallbackBody(slotInfo),
      source: "fallback",
      aiErrorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    };
  }
}

export default async function handler() {
  const requestId = crypto.randomUUID();
  let supabase;
  let runId = null;

  try {
    const config = readConfig();

    if (!config.enabled) {
      return jsonResponse(200, { outcome: "disabled", requestId });
    }

    const slotInfo = resolveChiaDailyMeteorSlot(new Date());

    if (!slotInfo || !SUPPORTED_SLOTS.has(slotInfo.slot)) {
      return jsonResponse(200, { outcome: "outside_schedule", requestId });
    }

    supabase = createSupabaseAdminClient(config);
    const claim = await claimRun(supabase, slotInfo);

    if (!claim?.claimed) {
      return jsonResponse(200, {
        outcome: "already_handled",
        slot: slotInfo.slot,
        localDate: slotInfo.localDate,
        requestId,
      });
    }

    runId = claim.run_id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", config.chiaProfileId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error(`chia_profile_not_found:${profileError?.code ?? "missing"}`);
    }

    const generated = await buildPostBody(config, slotInfo);
    const completion = await completeRun({
      supabase,
      runId,
      authorId: profile.id,
      generated,
    });

    let mentionSync = { created: 0, usernames: [] };
    try {
      mentionSync = await syncAiResidentPostMentions({
        supabase,
        postId: completion.post_id,
        actorProfileId: profile.id,
        body: generated.body,
      });
    } catch (error) {
      console.warn("chia_daily_meteor_mentions_failed", {
        requestId,
        runId,
        postId: completion.post_id,
        code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });
    }

    console.log("chia_daily_meteor_posted", {
      requestId,
      runId,
      postId: completion.post_id,
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      source: generated.source,
      outcome: completion.outcome,
      mentionCount: mentionSync.created,
    });

    return jsonResponse(200, {
      outcome: completion.outcome,
      postId: completion.post_id,
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      source: generated.source,
      mentionCount: mentionSync.created,
      requestId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "unknown";

    if (supabase && runId) {
      await markRunFailed(supabase, runId, code);
    }

    console.error("chia_daily_meteor_failed", { requestId, runId, code });
    return jsonResponse(503, { outcome: "failed", code, requestId });
  }
}

export const config = {
  schedule: CHIA_DAILY_METEOR_SCHEDULE,
};
