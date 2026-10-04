import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  signChiaDotMeteorRequest,
  verifyChiaDotMeteorRequest,
} from "./chiaDotMeteorAuth.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const MORNING = {
  slot: "morning",
  localDate: "2026-10-05",
  scheduledFor: "2026-10-04T23:00:00.000Z",
};
const MORNING_NOW = Date.parse("2026-10-04T23:00:20.000Z");
const SNAPSHOT_AT = "2026-10-04T23:00:10.000Z";
const SNAPSHOT_HASH = "a".repeat(64);

test("Ed25519署名済みpublishを現在の正規slotで検証する", () => {
  const signed = signChiaDotMeteorRequest({
    action: "publish",
    slotInfo: MORNING,
    body: "おはちあ！☀️ 今日もゆっくりいこうね。",
    privateKey,
    now: MORNING_NOW,
    nonce: "nonce-1234567890abcd",
    snapshotGeneratedAt: SNAPSHOT_AT,
    snapshotHash: SNAPSHOT_HASH,
  });
  const verified = verifyChiaDotMeteorRequest(signed, {
    publicKey,
    now: MORNING_NOW + 500,
    ttlSeconds: 60,
  });
  assert.equal(verified.action, "publish");
  assert.equal(verified.body, "おはちあ！☀️ 今日もゆっくりいこうね。");
  assert.deepEqual(verified.slotInfo, MORNING);
});

test("body/slot/signature改ざんと期限切れをfail closedする", () => {
  const signed = signChiaDotMeteorRequest({
    action: "publish",
    slotInfo: MORNING,
    body: "おはちあ！",
    privateKey,
    now: MORNING_NOW,
    nonce: "nonce-1234567890abcd",
    snapshotGeneratedAt: SNAPSHOT_AT,
    snapshotHash: SNAPSHOT_HASH,
  });
  for (const payload of [
    { ...signed, body: "改ざん" },
    { ...signed, slot: "evening" },
    { ...signed, signature: `${signed.signature[0] === "A" ? "B" : "A"}${signed.signature.slice(1)}` },
  ]) {
    assert.throws(
      () => verifyChiaDotMeteorRequest(payload, { publicKey, now: MORNING_NOW + 500 }),
      (error) => error.status === 403,
    );
  }
  assert.throws(
    () => verifyChiaDotMeteorRequest(signed, {
      publicKey,
      now: MORNING_NOW + 61_000,
      ttlSeconds: 60,
    }),
    (error) => error.status === 403 && error.code === "expired_chia_dot_meteor_request",
  );
});

test("publishは別slot時刻からの実行を拒否する", () => {
  const signed = signChiaDotMeteorRequest({
    action: "publish",
    slotInfo: MORNING,
    body: "おはちあ！",
    privateKey,
    now: MORNING_NOW,
    nonce: "nonce-1234567890abcd",
    snapshotGeneratedAt: SNAPSHOT_AT,
    snapshotHash: SNAPSHOT_HASH,
  });
  assert.throws(
    () => verifyChiaDotMeteorRequest(signed, {
      publicKey,
      now: Date.parse("2026-10-05T03:00:20.000Z"),
      ttlSeconds: 60,
    }),
    (error) => error.status === 403,
  );
});

test("publishはDot優先窓の10分を過ぎたらlegacy fallbackへ譲る", () => {
  const issuedNearBoundary = Date.parse("2026-10-04T23:09:30.000Z");
  const signed = signChiaDotMeteorRequest({
    action: "publish",
    slotInfo: MORNING,
    body: "おはちあ！",
    privateKey,
    now: issuedNearBoundary,
    nonce: "nonce-1234567890abcd",
    snapshotGeneratedAt: "2026-10-04T23:09:20.000Z",
    snapshotHash: SNAPSHOT_HASH,
  });
  assert.throws(
    () => verifyChiaDotMeteorRequest(signed, {
      publicKey,
      now: Date.parse("2026-10-04T23:10:00.000Z"),
      ttlSeconds: 60,
    }),
    (error) => error.status === 403 && error.code === "invalid_chia_dot_meteor_slot",
  );
});

test("publishは2分を超えたsnapshotを拒否する", () => {
  const signed = signChiaDotMeteorRequest({
    action: "publish",
    slotInfo: MORNING,
    body: "おはちあ！",
    privateKey,
    now: MORNING_NOW,
    nonce: "nonce-1234567890abcd",
    snapshotGeneratedAt: "2026-10-04T22:57:00.000Z",
    snapshotHash: SNAPSHOT_HASH,
  });
  assert.throws(
    () => verifyChiaDotMeteorRequest(signed, { publicKey, now: MORNING_NOW }),
    (error) => error.status === 403 && error.code === "stale_chia_dot_meteor_snapshot",
  );
});

test("repairは投稿後24時間以内ならslot時間を過ぎても署名検証できる", () => {
  const repairNow = Date.parse("2026-10-05T02:30:00.000Z");
  const signed = signChiaDotMeteorRequest({
    action: "repair",
    slotInfo: MORNING,
    body: "",
    privateKey,
    now: repairNow,
    nonce: "nonce-repair-12345678",
  });
  assert.equal(
    verifyChiaDotMeteorRequest(signed, { publicKey, now: repairNow }).action,
    "repair",
  );
});

test("snapshotは次の正規slotを24時間以内なら安全に先読みできる", () => {
  const beforeMorning = Date.parse("2026-10-04T15:40:00.000Z");
  const signed = signChiaDotMeteorRequest({
    action: "snapshot",
    slotInfo: MORNING,
    body: "",
    privateKey,
    now: beforeMorning,
    nonce: "nonce-1234567890abcd",
  });
  assert.equal(
    verifyChiaDotMeteorRequest(signed, { publicKey, now: beforeMorning + 500 }).action,
    "snapshot",
  );
});
