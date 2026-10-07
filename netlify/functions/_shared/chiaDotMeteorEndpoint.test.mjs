import assert from "node:assert/strict";
import test from "node:test";
import { handleChiaDotMeteor } from "../chia-dot-meteor.mjs";
import { hashChiaDotMeteorSnapshot } from "./chiaDotMeteorSnapshot.mjs";

const PROD_CONTEXT = { deploy: { context: "production", published: true }, requestId: "req" };
const SLOT = {
  slot: "morning",
  localDate: "2026-10-05",
  scheduledFor: "2026-10-04T23:00:00.000Z",
};
const CHIA = "00000000-0000-4000-8000-000000000001";

function request(body = {}) {
  return new Request("https://hoshizora-village.netlify.app/api/chia-dot-meteor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function env(name) {
  if (name === "CHIA_DOT_METEOR_ENABLED") return "true";
  if (name === "CHIA_DAILY_METEOR_ENABLED") return "true";
  if (name === "SUPABASE_URL") return "https://dhfecpymvmursozfgjlr.supabase.co";
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-role-placeholder";
  if (name === "CHIA_DAILY_METEOR_PROFILE_ID") return CHIA;
  return "";
}

test("Deploy Preview・branch deploy・未published Productionからはendpointを公開しない", async () => {
  for (const context of [
    { deploy: { context: "deploy-preview", published: false } },
    { deploy: { context: "branch-deploy", published: false } },
    { deploy: { context: "production", published: false } },
    {},
  ]) {
    let clients = 0;
    const response = await handleChiaDotMeteor(request(), context, {
      readEnv: env,
      createClient: () => { clients += 1; return {}; },
      verifyRequest: () => { throw new Error("must_not_verify"); },
    });
    assert.equal(response.status, 404);
    assert.equal(clients, 0);
  }
});

test("ProductionでもCHIA_DOT_METEOR_ENABLED=falseなら利用不能", async () => {
  let clients = 0;
  const response = await handleChiaDotMeteor(request(), PROD_CONTEXT, {
    readEnv(name) {
      if (name === "CHIA_DOT_METEOR_ENABLED") return "false";
      return env(name);
    },
    createClient: () => { clients += 1; return {}; },
  });
  assert.equal(response.status, 404);
  assert.equal(clients, 0);
});

test("既存master flagがfalseならDot flag=trueでも利用不能", async () => {
  let clients = 0;
  const response = await handleChiaDotMeteor(request(), PROD_CONTEXT, {
    readEnv(name) {
      if (name === "CHIA_DAILY_METEOR_ENABLED") return "false";
      return env(name);
    },
    createClient: () => { clients += 1; return {}; },
  });
  assert.equal(response.status, 404);
  assert.equal(clients, 0);
});

test("Production Supabase以外を設定した場合はservice-role clientを作らずfail closed", async () => {
  let clients = 0;
  const response = await handleChiaDotMeteor(request(), PROD_CONTEXT, {
    readEnv(name) {
      if (name === "SUPABASE_URL") return "https://qskeezefmvnutuzpevbc.supabase.co";
      return env(name);
    },
    createClient: () => { clients += 1; return {}; },
    errorLog: () => {},
  });
  assert.equal(response.status, 503);
  assert.equal(clients, 0);
});

test("署名検証後のsnapshotだけがbounded loaderへ到達する", async () => {
  const client = { tag: "admin" };
  let received = null;
  const response = await handleChiaDotMeteor(request({ signed: true }), PROD_CONTEXT, {
    now: Date.parse("2026-10-04T22:59:30.000Z"),
    readEnv: env,
    createClient: (config) => {
      assert.equal(config.supabaseUrl, "https://dhfecpymvmursozfgjlr.supabase.co");
      assert.equal(config.chiaProfileId, CHIA);
      return client;
    },
    verifyRequest: () => ({ action: "snapshot", slotInfo: SLOT, body: "" }),
    loadSnapshot: async (input) => {
      received = input;
      return {
        version: 1,
        generatedAt: "2026-10-04T22:59:30.000Z",
        slot: SLOT,
        recentPublicMeteors: [],
        recentChiaMeteors: [],
        observedMeteors: [],
        recentMentionHistory: [],
        recentDailyRuns: [],
      };
    },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.outcome, "snapshot");
  assert.match(payload.snapshotHash, /^[0-9a-f]{64}$/);
  assert.equal(received.supabase, client);
  assert.deepEqual(received.slotInfo, SLOT);
  assert.equal(received.chiaProfileId, CHIA);
});

test("publishは署名で確定したbody/slotだけをpublish helperへ渡す", async () => {
  let received = null;
  const snapshot = {
    version: 1,
    generatedAt: "2026-10-04T23:00:05.000Z",
    slot: SLOT,
    recentPublicMeteors: [{ author: { username: "alice", displayName: "Alice" }, body: "朝だね", mediaObserved: false }],
    recentChiaMeteors: [],
    observedMeteors: [{ author: { username: "bob", displayName: "Bob" }, mediaObserved: true, evidenceKey: "b".repeat(64) }],
    recentMentionHistory: [],
    recentDailyRuns: [],
  };
  const response = await handleChiaDotMeteor(request({ signed: true }), PROD_CONTEXT, {
    now: Date.parse("2026-10-04T23:00:20.000Z"),
    readEnv: env,
    createClient: () => ({ tag: "admin" }),
    verifyRequest: () => ({
      action: "publish",
      slotInfo: SLOT,
      body: "おはちあ！ @alice さん、おはよう。",
      snapshotHash: hashChiaDotMeteorSnapshot(snapshot),
      mediaEvidenceKey: "",
      groundingMode: "non_media",
    }),
    loadSnapshot: async () => snapshot,
    publish: async (input) => {
      received = input;
      return { status: 200, payload: { outcome: "posted", postId: "post-1", requestId: "req" } };
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome, "posted");
  assert.deepEqual(received.slotInfo, SLOT);
  assert.equal(received.body, "おはちあ！ @alice さん、おはよう。");
  assert.equal(received.chiaProfileId, CHIA);
  assert.deepEqual(received.allowedMentionUsernames, ["alice", "bob"]);
  assert.deepEqual(received.allowedMediaEvidenceKeys, ["b".repeat(64)]);
  assert.equal(received.groundingMode, "non_media");
});

test("publish直前のVillage snapshotが変わっていれば409で投稿しない", async () => {
  let publishCalls = 0;
  const currentSnapshot = {
    version: 1,
    generatedAt: "2026-10-04T23:00:20.000Z",
    slot: SLOT,
    recentPublicMeteors: [],
    recentChiaMeteors: [],
    observedMeteors: [],
    recentMentionHistory: [],
    recentDailyRuns: [],
  };
  const response = await handleChiaDotMeteor(request({ signed: true }), PROD_CONTEXT, {
    readEnv: env,
    createClient: () => ({}),
    verifyRequest: () => ({
      action: "publish",
      slotInfo: SLOT,
      body: "おはちあ！",
      snapshotHash: "a".repeat(64),
      mediaEvidenceKey: "",
      groundingMode: "non_media",
    }),
    loadSnapshot: async () => currentSnapshot,
    publish: async () => { publishCalls += 1; return { status: 200, payload: { outcome: "posted" } }; },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "stale_chia_dot_meteor_snapshot");
  assert.equal(publishCalls, 0);
});

test("72時間以内に既mentionの村人はfresh snapshotにいても再mention候補から除外する", async () => {
  let received = null;
  const snapshot = {
    version: 1,
    generatedAt: "2026-10-04T23:00:20.000Z",
    slot: SLOT,
    recentPublicMeteors: [
      { author: { username: "alice", displayName: "Alice" }, body: "朝", mediaObserved: false },
      { author: { username: "bob", displayName: "Bob" }, body: "朝", mediaObserved: false },
    ],
    recentChiaMeteors: [],
    observedMeteors: [],
    recentMentionHistory: [{ username: "alice", createdAt: "2026-10-04T10:00:00.000Z" }],
    recentDailyRuns: [],
  };
  const response = await handleChiaDotMeteor(request({ signed: true }), PROD_CONTEXT, {
    readEnv: env,
    createClient: () => ({}),
    verifyRequest: () => ({
      action: "publish",
      slotInfo: SLOT,
      body: "おはちあ！",
      snapshotHash: hashChiaDotMeteorSnapshot(snapshot),
      mediaEvidenceKey: "",
      groundingMode: "non_media",
    }),
    loadSnapshot: async () => snapshot,
    publish: async (input) => { received = input; return { status: 200, payload: { outcome: "posted" } }; },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received.allowedMentionUsernames, ["bob"]);
});

test("repair actionは投稿を増やさず既存posted runのmention同期だけを呼ぶ", async () => {
  let repaired = null;
  const response = await handleChiaDotMeteor(request({ signed: true }), PROD_CONTEXT, {
    readEnv: env,
    createClient: () => ({}),
    verifyRequest: () => ({ action: "repair", slotInfo: SLOT, body: "" }),
    repairMentions: async (input) => {
      repaired = input;
      return { postId: "post-1", source: "ai", body: "おはちあ！", mentionCount: 1, mentionedUsernames: ["alice"] };
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.outcome, "repaired");
  assert.equal(payload.postId, "post-1");
  assert.deepEqual(repaired.slotInfo, SLOT);
});

test("500文字の絵文字bodyを含む署名envelopeもtransport上は4KB以内で受けられる", async () => {
  const envelope = {
    action: "publish",
    slot: "morning",
    localDate: "2026-10-05",
    scheduledFor: "2026-10-04T23:00:00.000Z",
    issuedAt: 1791154800,
    nonce: "nonce-1234567890abcd",
    bodyHash: "0".repeat(64),
    body: "🌟".repeat(500),
    snapshotGeneratedAt: "2026-10-04T23:00:10.000Z",
    snapshotHash: "a".repeat(64),
    mediaEvidenceKey: "",
    groundingMode: "non_media",
    signature: "A".repeat(86),
  };
  let verifiedPayload = null;
  const response = await handleChiaDotMeteor(request(envelope), PROD_CONTEXT, {
    readEnv: env,
    createClient: () => ({}),
    verifyRequest: (payload) => {
      verifiedPayload = payload;
      return {
        action: "publish",
        slotInfo: SLOT,
        body: "おはちあ！",
        snapshotHash: hashChiaDotMeteorSnapshot({
          version: 1,
          slot: SLOT,
          recentPublicMeteors: [], recentChiaMeteors: [], observedMeteors: [], recentMentionHistory: [], recentDailyRuns: [],
        }),
        mediaEvidenceKey: "",
        groundingMode: "non_media",
      };
    },
    loadSnapshot: async () => ({
      version: 1,
      generatedAt: "2026-10-04T23:00:10.000Z",
      slot: SLOT,
      recentPublicMeteors: [], recentChiaMeteors: [], observedMeteors: [], recentMentionHistory: [], recentDailyRuns: [],
    }),
    publish: async () => ({ status: 200, payload: { outcome: "posted", postId: "post-1" } }),
  });
  assert.equal(response.status, 200);
  assert.equal(Array.from(verifiedPayload.body).length, 500);
});
