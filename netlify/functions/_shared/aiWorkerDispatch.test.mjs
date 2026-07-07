import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWorkerDispatchTtlSeconds,
  signWorkerDispatch,
  verifyWorkerDispatchPayload,
} from "./aiWorkerDispatch.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

const JOB_ID = "77777777-7777-4777-8777-777777777777";
const SECRET = "s".repeat(32);

test("worker dispatch signature verifies valid payloads", () => {
  const store = new Map();
  const payload = signWorkerDispatch({
    jobId: JOB_ID,
    secret: SECRET,
    now: 100000,
    nonce: "nonce-1234567890abcd",
  });

  assert.deepEqual(verifyWorkerDispatchPayload(payload, {
    secret: SECRET,
    ttlSeconds: 60,
    now: 100500,
    store,
  }), {
    jobId: JOB_ID,
    issuedAt: 100,
    nonce: "nonce-1234567890abcd",
    observationContext: AI_OBSERVATION_CONTEXT.MANUAL,
  });
});

test("worker dispatch signs automatic text observation context", () => {
  const store = new Map();
  const payload = signWorkerDispatch({
    jobId: JOB_ID,
    secret: SECRET,
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    now: 100000,
    nonce: "nonce-1234567890abcd",
  });

  assert.equal(payload.observationContext, AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST);
  assert.deepEqual(verifyWorkerDispatchPayload(payload, {
    secret: SECRET,
    ttlSeconds: 60,
    now: 100500,
    store,
  }), {
    jobId: JOB_ID,
    issuedAt: 100,
    nonce: "nonce-1234567890abcd",
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
  });

  assert.throws(
    () => verifyWorkerDispatchPayload({
      ...payload,
      observationContext: AI_OBSERVATION_CONTEXT.MANUAL,
    }, {
      secret: SECRET,
      ttlSeconds: 60,
      now: 100500,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );
});

test("worker dispatch rejects expired, mismatched, tampered, and replayed payloads", () => {
  const valid = signWorkerDispatch({
    jobId: JOB_ID,
    secret: SECRET,
    now: 100000,
    nonce: "nonce-1234567890abcd",
  });

  assert.throws(
    () => verifyWorkerDispatchPayload(valid, {
      secret: SECRET,
      ttlSeconds: 60,
      now: 161000,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );
  assert.throws(
    () => verifyWorkerDispatchPayload(valid, {
      expectedJobId: "88888888-8888-4888-8888-888888888888",
      secret: SECRET,
      ttlSeconds: 60,
      now: 100500,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );
  assert.throws(
    () => verifyWorkerDispatchPayload({
      ...valid,
      signature: `${valid.signature.slice(0, -1)}${valid.signature.endsWith("0") ? "1" : "0"}`,
    }, {
      secret: SECRET,
      ttlSeconds: 60,
      now: 100500,
      store: new Map(),
    }),
    (error) => error.status === 403,
  );

  const replayStore = new Map();
  verifyWorkerDispatchPayload(valid, {
    secret: SECRET,
    ttlSeconds: 60,
    now: 100500,
    store: replayStore,
  });
  assert.throws(
    () => verifyWorkerDispatchPayload(valid, {
      secret: SECRET,
      ttlSeconds: 60,
      now: 101000,
      store: replayStore,
    }),
    (error) => error.status === 403,
  );
});

test("worker dispatch TTL validates safe range", () => {
  assert.equal(normalizeWorkerDispatchTtlSeconds(undefined), 60);
  assert.equal(normalizeWorkerDispatchTtlSeconds(300), 300);
  assert.throws(() => normalizeWorkerDispatchTtlSeconds(0), /invalid_env/);
  assert.throws(() => normalizeWorkerDispatchTtlSeconds(301), /invalid_env/);
});
