import { assertJsonRequest, readStrictJsonBody } from "./_shared/aiValidation.mjs";
import {
  ChiaDailyMeteorDispatchError,
  readChiaDailyMeteorDispatchAuthConfig,
  verifyChiaDailyMeteorDispatch,
} from "./_shared/chiaDailyMeteorDispatchAuth.mjs";
import { runChiaDailyMeteor } from "./_shared/chiaDailyMeteorDispatch.mjs";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function toSafeError(error) {
  if (error instanceof ChiaDailyMeteorDispatchError) {
    return { status: error.status, code: error.code };
  }

  if (error && typeof error === "object" && Number.isInteger(error.status)) {
    return {
      status: error.status,
      code: typeof error.code === "string" ? error.code.slice(0, 120) : "invalid_request",
    };
  }

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return { status: 503, code: "chia_daily_meteor_configuration_error" };
  }

  return { status: 503, code: "chia_daily_meteor_background_failed" };
}

export async function handleChiaDailyMeteorBackground(request, context = {}, dependencies = {}) {
  const {
    env,
    now = Date.now(),
    nonceStore,
    readAuthConfig = readChiaDailyMeteorDispatchAuthConfig,
    runDailyMeteor = runChiaDailyMeteor,
    info = console.log,
    warn = console.warn,
    errorLog = console.error,
  } = dependencies;
  const requestId = context.requestId ?? crypto.randomUUID();

  try {
    if (request.method !== "POST") {
      return jsonResponse(405, {
        outcome: "rejected",
        code: "method_not_allowed",
        requestId,
      });
    }

    assertJsonRequest(request);
    const authConfig = readAuthConfig(env);
    const verified = verifyChiaDailyMeteorDispatch(await readStrictJsonBody(request), {
      secret: authConfig.secret,
      ttlSeconds: authConfig.ttlSeconds,
      now,
      store: nonceStore,
    });

    info("chia_daily_meteor_background_accepted", {
      requestId,
      slot: verified.slotInfo.slot,
      localDate: verified.slotInfo.localDate,
    });

    return runDailyMeteor(verified.slotInfo, {
      requestId,
      info,
      warn,
      errorLog,
    });
  } catch (error) {
    const safeError = toSafeError(error);
    const log = safeError.status >= 500 ? errorLog : warn;
    log("chia_daily_meteor_background_rejected", {
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
  return handleChiaDailyMeteorBackground(request, context);
}

export const config = {
  path: "/api/chia-daily-meteor-background",
  method: ["POST"],
  background: true,
};
