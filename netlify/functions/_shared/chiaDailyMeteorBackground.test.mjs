import assert from "node:assert/strict";
import test from "node:test";
import {
  config,
  handleChiaDailyMeteorBackground,
} from "../chia-daily-meteor-background.mjs";
import { signChiaDailyMeteorDispatch } from "./chiaDailyMeteorDispatchAuth.mjs";

const SECRET = "s".repeat(32);
const NOW = Date.parse("2026-08-14T10:00:00.000Z");
const SLOT_INFO = {
  slot: "evening",
  localDate: "2026-08-14",
  scheduledFor: "2026-08-14T10:00:00.000Z",
};

function createRequest(payload) {
  return new Request("https://deploy.example/api/chia-daily-meteor-background", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("署名済みdispatchだけを受けてBackgroundで実処理を開始する", async () => {
  const payload = signChiaDailyMeteorDispatch(SLOT_INFO, {
    secret: SECRET,
    now: NOW,
    nonce: "nonce-1234567890abcd",
  });
  let received = null;
  const response = await handleChiaDailyMeteorBackground(
    createRequest(payload),
    { requestId: "background-request" },
    {
      now: NOW + 500,
      nonceStore: new Map(),
      readAuthConfig: () => ({ secret: SECRET, ttlSeconds: 60 }),
      runDailyMeteor: async (slotInfo, dependencies) => {
        received = { slotInfo, requestId: dependencies.requestId };
        return new Response(JSON.stringify({ outcome: "posted" }), { status: 200 });
      },
      info: () => {},
      warn: () => {},
      errorLog: () => {},
    },
  );

  assert.equal(config.background, true);
  assert.deepEqual(received, {
    slotInfo: SLOT_INFO,
    requestId: "background-request",
  });
  assert.equal(response.status, 200);
});

test("不正な直接実行は拒否し、日次処理を呼ばない", async () => {
  const payload = signChiaDailyMeteorDispatch(SLOT_INFO, {
    secret: SECRET,
    now: NOW,
    nonce: "nonce-1234567890abcd",
  });
  let runCalls = 0;
  const response = await handleChiaDailyMeteorBackground(
    createRequest({ ...payload, signature: "0".repeat(64) }),
    { requestId: "unauthorized-request" },
    {
      now: NOW + 500,
      nonceStore: new Map(),
      readAuthConfig: () => ({ secret: SECRET, ttlSeconds: 60 }),
      runDailyMeteor: async () => {
        runCalls += 1;
        return new Response(null, { status: 200 });
      },
      info: () => {},
      warn: () => {},
      errorLog: () => {},
    },
  );

  assert.equal(response.status, 403);
  assert.equal(runCalls, 0);
  assert.deepEqual(await response.json(), {
    outcome: "rejected",
    code: "invalid_chia_daily_meteor_dispatch",
    requestId: "unauthorized-request",
  });
});
