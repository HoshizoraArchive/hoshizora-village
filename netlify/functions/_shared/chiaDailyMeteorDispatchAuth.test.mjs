import assert from "node:assert/strict";
import test from "node:test";
import {
  readChiaDailyMeteorDispatchAuthConfig,
  signChiaDailyMeteorDispatch,
  verifyChiaDailyMeteorDispatch,
} from "./chiaDailyMeteorDispatchAuth.mjs";

const SECRET = "s".repeat(32);
const NOW = Date.parse("2026-08-14T10:00:00.000Z");
const SLOT_INFO = {
  slot: "evening",
  localDate: "2026-08-14",
  scheduledFor: "2026-08-14T10:00:00.000Z",
};

test("既存AI_WORKER_SHARED_SECRETでslot payloadを署名・検証する", () => {
  const authConfig = readChiaDailyMeteorDispatchAuthConfig({
    AI_WORKER_SHARED_SECRET: SECRET,
    AI_WORKER_DISPATCH_TTL_SECONDS: "60",
  });
  const payload = signChiaDailyMeteorDispatch(SLOT_INFO, {
    secret: authConfig.secret,
    now: NOW,
    nonce: "nonce-1234567890abcd",
  });

  assert.deepEqual(verifyChiaDailyMeteorDispatch(payload, {
    ...authConfig,
    now: NOW + 500,
    store: new Map(),
  }).slotInfo, SLOT_INFO);
});

test("改ざん・期限切れ・replay・schedule外slotを拒否する", () => {
  const valid = signChiaDailyMeteorDispatch(SLOT_INFO, {
    secret: SECRET,
    now: NOW,
    nonce: "nonce-1234567890abcd",
  });

  assert.throws(
    () => verifyChiaDailyMeteorDispatch({ ...valid, slot: "morning" }, {
      secret: SECRET,
      ttlSeconds: 60,
      now: NOW + 500,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );
  assert.throws(
    () => verifyChiaDailyMeteorDispatch(valid, {
      secret: SECRET,
      ttlSeconds: 60,
      now: NOW + 61000,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );

  const replayStore = new Map();
  verifyChiaDailyMeteorDispatch(valid, {
    secret: SECRET,
    ttlSeconds: 60,
    now: NOW + 500,
    store: replayStore,
  });
  assert.throws(
    () => verifyChiaDailyMeteorDispatch(valid, {
      secret: SECRET,
      ttlSeconds: 60,
      now: NOW + 1000,
      store: replayStore,
    }),
    (error) => error.status === 403,
  );

  assert.throws(
    () => signChiaDailyMeteorDispatch(SLOT_INFO, {
      secret: SECRET,
      now: Date.parse("2026-08-14T11:00:00.000Z"),
      nonce: "nonce-1234567890abcd",
    }),
    (error) => error.status === 403,
  );
});

test("共有secretが未設定または短すぎる場合はdispatch設定を拒否する", () => {
  assert.throws(
    () => readChiaDailyMeteorDispatchAuthConfig({ AI_WORKER_SHARED_SECRET: "short" }),
    /invalid_env:AI_WORKER_SHARED_SECRET/,
  );
});
