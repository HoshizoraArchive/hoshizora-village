import { readAiObservationConfig } from "./_shared/aiConfig.mjs";
import { dispatchDueAiObservationJobs } from "./_shared/aiDueDispatch.mjs";
import { AI_ERROR, AiHttpError, aiHttpError, errorResponse, jsonResponse, logAiEvent } from "./_shared/aiErrors.mjs";
import { recoverStaleProcessingJobs } from "./_shared/aiStaleJobs.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

function getRequestId(context) {
  return context?.requestId ?? crypto.randomUUID();
}

function toSafeError(error) {
  if (error instanceof AiHttpError) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
  }

  return aiHttpError(503, AI_ERROR.INTERNAL);
}

function readConfigOrThrow() {
  try {
    const config = readAiObservationConfig();

    if (!config.enabled) {
      throw aiHttpError(503, AI_ERROR.DISABLED);
    }

    return config;
  } catch (error) {
    if (error instanceof AiHttpError) {
      throw error;
    }

    throw aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
  }
}

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();

  try {
    const config = readConfigOrThrow();
    const supabase = createSupabaseAdminClient(config);

    await recoverStaleProcessingJobs({
      supabase,
      config,
      requestId,
      operation: "ai_observation_dispatch_due",
    });

    const result = await dispatchDueAiObservationJobs({
      request,
      supabase,
      config,
      requestId,
    });

    logAiEvent("info", "ai_observation_due_dispatch_completed", {
      requestId,
      operation: "ai_observation_dispatch_due",
      status: 200,
      code: "OK",
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(200, {
      ...result,
      requestId,
    });
  } catch (error) {
    const safeError = toSafeError(error);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_due_dispatch_error", {
      requestId,
      operation: "ai_observation_dispatch_due",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  schedule: "*/1 * * * *",
};
