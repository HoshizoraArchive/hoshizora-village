import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleChiaDailyMeteorScheduled } from "../chia-daily-meteor-scheduled.mjs";
import { verifyChiaDailyMeteorDispatch } from "./chiaDailyMeteorDispatchAuth.mjs";

const SECRET = "s".repeat(32);
const REQUEST = new Request(
  "https://deploy.example/.netlify/functions/chia-daily-meteor-scheduled",
);

async function dispatchAt(isoTimestamp, env = { CHIA_DAILY_METEOR_ENABLED: "true" }) {
  const calls = [];
  const logs = [];
  const now = new Date(isoTimestamp);
  const response = await handleChiaDailyMeteorScheduled(
    REQUEST,
    { requestId: `request-${isoTimestamp}` },
    {
      env,
      now,
      readAuthConfig: () => ({ secret: SECRET, ttlSeconds: 60 }),
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(null, { status: 202 });
      },
      info: (...args) => logs.push(args),
      errorLog: (...args) => logs.push(args),
    },
  );

  assert.equal(response.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://deploy.example/api/chia-daily-meteor-background");
  const verified = verifyChiaDailyMeteorDispatch(JSON.parse(calls[0].options.body), {
    secret: SECRET,
    ttlSeconds: 60,
    now: now.getTime(),
    store: new Map(),
  });

  return { response, verified, logs };
}

test("Scheduled FunctionはAIやDB処理を持たずBackground dispatchだけを行う", () => {
  const source = readFileSync("netlify/functions/chia-daily-meteor-scheduled.mjs", "utf8");

  assert.match(source, /dispatchChiaDailyMeteorBackground/);
  assert.doesNotMatch(source, /GoogleGenAI|createSupabaseAdminClient|buildPostBody|runChiaDailyMeteor/);
});

test("morning / noon / eveningのslotをBackgroundへ正しく引き渡す", async () => {
  const cases = [
    ["2026-08-13T23:00:00.000Z", "morning", "2026-08-14", "2026-08-13T23:00:00.000Z"],
    ["2026-08-14T03:00:00.000Z", "noon", "2026-08-14", "2026-08-14T03:00:00.000Z"],
    ["2026-08-14T10:00:00.000Z", "evening", "2026-08-14", "2026-08-14T10:00:00.000Z"],
  ];

  for (const [now, slot, localDate, scheduledFor] of cases) {
    const { verified, logs } = await dispatchAt(now);
    assert.deepEqual(verified.slotInfo, { slot, localDate, scheduledFor });
    assert.equal(logs[0][0], "chia_daily_meteor_scheduled_received");
    assert.equal(logs[1][0], "chia_daily_meteor_background_dispatch_succeeded");
    assert.equal(logs[1][1].slot, slot);
  }
});

test("Background dispatch失敗はslot付きで記録し503を返す", async () => {
  const logs = [];
  const response = await handleChiaDailyMeteorScheduled(REQUEST, { requestId: "request-failed" }, {
    env: { CHIA_DAILY_METEOR_ENABLED: "true" },
    now: new Date("2026-08-14T10:00:00.000Z"),
    readAuthConfig: () => ({ secret: SECRET, ttlSeconds: 60 }),
    fetchImpl: async () => new Response(null, { status: 500 }),
    info: (...args) => logs.push(args),
    errorLog: (...args) => logs.push(args),
  });

  assert.equal(response.status, 503);
  assert.equal(logs.at(-1)[0], "chia_daily_meteor_background_dispatch_failed");
  assert.equal(logs.at(-1)[1].slot, "evening");
  assert.equal(logs.at(-1)[1].localDate, "2026-08-14");
});

test("Dot有効時は各slotの0-9分をDot優先窓としてlegacy dispatchを止める", async () => {
  for (const nowValue of [
    "2026-08-13T23:00:00.000Z",
    "2026-08-14T03:09:59.000Z",
    "2026-08-14T10:05:00.000Z",
  ]) {
    let calls = 0;
    const response = await handleChiaDailyMeteorScheduled(REQUEST, {}, {
      env: {
        CHIA_DAILY_METEOR_ENABLED: "true",
        CHIA_DOT_METEOR_ENABLED: "true",
      },
      now: new Date(nowValue),
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 202 });
      },
      info: () => {},
      errorLog: () => {},
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).outcome, "dot_priority_window");
    assert.equal(calls, 0);
  }
});

test("Dot有効でも10分以降はlegacy fallbackをdispatchする", async () => {
  const { verified } = await dispatchAt("2026-08-14T10:10:00.000Z", {
    CHIA_DAILY_METEOR_ENABLED: "true",
    CHIA_DOT_METEOR_ENABLED: "true",
  });
  assert.equal(verified.slotInfo.slot, "evening");
});

test("Dot env未設定またはfalseなら0分でも従来どおりlegacy dispatchする", async () => {
  for (const dotValue of [undefined, "false"]) {
    const env = { CHIA_DAILY_METEOR_ENABLED: "true" };
    if (dotValue !== undefined) env.CHIA_DOT_METEOR_ENABLED = dotValue;
    const { verified } = await dispatchAt("2026-08-14T10:00:00.000Z", env);
    assert.equal(verified.slotInfo.slot, "evening");
  }
});
