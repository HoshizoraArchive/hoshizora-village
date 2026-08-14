import { readEnv } from "./_shared/aiConfig.mjs";
import {
  readChiaDailyMeteorDispatchAuthConfig,
  signChiaDailyMeteorDispatch,
} from "./_shared/chiaDailyMeteorDispatchAuth.mjs";
import {
  CHIA_DAILY_METEOR_SCHEDULE,
  resolveChiaDailyMeteorSlot,
} from "./_shared/chiaDailyMeteor.mjs";

const BACKGROUND_FUNCTION_PATH = "/api/chia-daily-meteor-background";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readErrorCode(error) {
  return error instanceof Error ? error.message.slice(0, 120) : "unknown";
}

export async function dispatchChiaDailyMeteorBackground({
  request,
  slotInfo,
  authConfig,
  now,
  fetchImpl = fetch,
}) {
  const backgroundUrl = new URL(BACKGROUND_FUNCTION_PATH, request.url);
  const payload = signChiaDailyMeteorDispatch(slotInfo, {
    secret: authConfig.secret,
    now,
  });
  const response = await fetchImpl(backgroundUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || response.status !== 202) {
    throw new Error(`chia_daily_meteor_background_dispatch_failed:${response.status}`);
  }
}

export async function handleChiaDailyMeteorScheduled(request, context = {}, dependencies = {}) {
  const {
    env,
    now = new Date(),
    fetchImpl = fetch,
    readAuthConfig = readChiaDailyMeteorDispatchAuthConfig,
    info = console.log,
    errorLog = console.error,
  } = dependencies;
  const requestId = context.requestId ?? crypto.randomUUID();
  const nowDate = now instanceof Date ? now : new Date(now);

  if (readEnv("CHIA_DAILY_METEOR_ENABLED", env).trim() !== "true") {
    return jsonResponse(200, { outcome: "disabled", requestId });
  }

  const slotInfo = resolveChiaDailyMeteorSlot(nowDate);

  if (!slotInfo) {
    return jsonResponse(200, { outcome: "outside_schedule", requestId });
  }

  info("chia_daily_meteor_scheduled_received", {
    requestId,
    slot: slotInfo.slot,
    localDate: slotInfo.localDate,
  });

  try {
    const authConfig = readAuthConfig(env);
    await dispatchChiaDailyMeteorBackground({
      request,
      slotInfo,
      authConfig,
      now: nowDate.getTime(),
      fetchImpl,
    });

    info("chia_daily_meteor_background_dispatch_succeeded", {
      requestId,
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
    });

    return jsonResponse(202, {
      outcome: "background_dispatched",
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      requestId,
    });
  } catch (error) {
    const code = readErrorCode(error);
    errorLog("chia_daily_meteor_background_dispatch_failed", {
      requestId,
      slot: slotInfo.slot,
      localDate: slotInfo.localDate,
      code,
    });
    return jsonResponse(503, {
      outcome: "background_dispatch_failed",
      code,
      requestId,
    });
  }
}

export default async function handler(request, context) {
  return handleChiaDailyMeteorScheduled(request, context);
}

export const config = {
  schedule: CHIA_DAILY_METEOR_SCHEDULE,
};
