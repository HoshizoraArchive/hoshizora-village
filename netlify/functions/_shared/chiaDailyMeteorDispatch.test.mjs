import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AI_TIMEOUT_MS,
  DISCOVERY_AI_TIMEOUT_MS,
  buildPostBody,
  generateAiBody,
  generateDiscoveryAiBody,
  runChiaDailyMeteor,
  syncCompletedPostMentions,
} from "./chiaDailyMeteorDispatch.mjs";

const CONFIG = {
  chiaProfileId: "00000000-0000-4000-8000-000000000099",
  discoveryEnabled: true,
  aiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
};
const EVENING = {
  slot: "evening",
  localDate: "2026-08-14",
  scheduledFor: "2026-08-14T10:00:00.000Z",
};
const DISCOVERY_BODY = [
  "@TargetHuman さん、最近ちょっと気になってる村人さんですっ。",
  "作品の色づかいに、その人らしいやさしさが重なって見えて、ちあは流星便で会うたびに少しうれしくなるんだ。",
  "これからどんな光を届けてくれるのか、そっと応援したくなるよ🌟",
].join("\n");

test("通常の朝夜AI生成は従来の15秒timeoutを使う", async () => {
  let receivedTimeout = null;
  const body = await generateAiBody(CONFIG, EVENING, async (_config, _prompt, timeoutMs) => {
    receivedTimeout = timeoutMs;
    return JSON.stringify({ body: "こんばんちあ🌙 今日もおつちあ！" });
  });

  assert.equal(DEFAULT_AI_TIMEOUT_MS, 15000);
  assert.equal(receivedTimeout, DEFAULT_AI_TIMEOUT_MS);
  assert.equal(body, "こんばんちあ🌙 今日もおつちあ！");
});

test("discovery AI生成だけ60秒timeoutを使う", async () => {
  let receivedTimeout = null;
  const body = await generateDiscoveryAiBody(
    CONFIG,
    EVENING,
    {
      username: "TargetHuman",
      evidence: [{ analysisSummary: "作品の色づかいを観測した。" }],
    },
    async (_config, _prompt, timeoutMs) => {
      receivedTimeout = timeoutMs;
      return JSON.stringify({ body: DISCOVERY_BODY });
    },
  );

  assert.equal(DISCOVERY_AI_TIMEOUT_MS, 60000);
  assert.equal(receivedTimeout, DISCOVERY_AI_TIMEOUT_MS);
  assert.equal(body, DISCOVERY_BODY);
});

test("feature flag falseではselectorを呼ばず既存evening生成をそのまま使う", async () => {
  let selectorCalls = 0;
  const generated = await buildPostBody(
    { ...CONFIG, discoveryEnabled: false },
    EVENING,
    {
      selectDiscoveryCandidate: async () => {
        selectorCalls += 1;
        return { username: "NeverCalled" };
      },
      generateDailyBody: async () => "こんばんちあ🌙 いつもの夜の流星便だよ。",
    },
  );

  assert.equal(selectorCalls, 0);
  assert.equal(generated.body, "こんばんちあ🌙 いつもの夜の流星便だよ。");
  assert.equal(generated.source, "ai");
  assert.equal(generated.discoveryAttempted, false);
  assert.equal(generated.discoverySelected, false);
});

test("morning/noonではfeature flagがtrueでもdiscovery選定をしない", async () => {
  let selectorCalls = 0;
  const dependencies = {
    selectDiscoveryCandidate: async () => {
      selectorCalls += 1;
      return { username: "NeverCalled" };
    },
    generateDailyBody: async () => "おはちあ！ いつもの朝だよ。",
  };

  const morning = await buildPostBody(CONFIG, {
    slot: "morning",
    localDate: "2026-08-14",
    scheduledFor: "2026-08-13T23:00:00.000Z",
  }, dependencies);
  const noon = await buildPostBody(CONFIG, {
    slot: "noon",
    localDate: "2026-08-14",
    scheduledFor: "2026-08-14T03:00:00.000Z",
  }, dependencies);

  assert.equal(selectorCalls, 0);
  assert.equal(morning.discoveryAttempted, false);
  assert.equal(noon.discoveryAttempted, false);
  assert.equal(noon.source, "curated");
});

test("selector/query失敗時はwarnだけで通常evening生成へfallbackする", async () => {
  const warnings = [];
  const generated = await buildPostBody(CONFIG, EVENING, {
    selectDiscoveryCandidate: async () => {
      throw new Error("discovery_observation_query_failed:timeout");
    },
    generateDailyBody: async () => "こんばんちあ🌙 通常の夜投稿へ戻ったよ。",
    warn: (...args) => warnings.push(args),
  });

  assert.equal(generated.body, "こんばんちあ🌙 通常の夜投稿へ戻ったよ。");
  assert.equal(generated.discoveryAttempted, true);
  assert.equal(generated.discoverySelected, false);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "chia_subjective_human_discovery_fallback");
  assert.deepEqual(Object.keys(warnings[0][1]).sort(), [
    "candidateSelected",
    "candidateUsername",
    "code",
    "fallbackToDaily",
    "generationSucceeded",
    "isTimeout",
    "localDate",
    "slot",
  ]);
  assert.equal(warnings[0][1].candidateSelected, false);
  assert.equal(warnings[0][1].candidateUsername, null);
});

test("discovery出力のreject時も通常evening生成へfallbackする", async () => {
  const generated = await buildPostBody(CONFIG, EVENING, {
    selectDiscoveryCandidate: async () => ({
      profileId: "target-id",
      username: "TargetHuman",
      evidence: [{ analysisSummary: "観測済み" }],
    }),
    generateDiscoveryBody: async () => {
      throw new Error("discovery_ai_output_invalid");
    },
    generateDailyBody: async () => "こんばんちあ🌙 通常の夜投稿だよ。",
    info: () => {},
    warn: () => {},
  });

  assert.equal(generated.body, "こんばんちあ🌙 通常の夜投稿だよ。");
  assert.equal(generated.discoverySelected, false);
  assert.equal(generated.discoveryCandidateSelected, true);
  assert.equal(generated.discoveryCandidateUsername, "TargetHuman");
  assert.equal(generated.discoveryGenerationSucceeded, false);
  assert.equal(generated.discoveryTimedOut, false);
  assert.equal(generated.discoveryFallbackToDaily, true);
});

test("discovery timeout時は候補とtimeoutを記録して通常投稿生成へfallbackする", async () => {
  const warnings = [];
  let dailyCalls = 0;
  const generated = await buildPostBody(CONFIG, EVENING, {
    selectDiscoveryCandidate: async () => ({
      profileId: "target-id",
      username: "Fate_to_Ash",
      evidence: [{ analysisSummary: "観測済み" }],
    }),
    generateDiscoveryBody: async () => {
      throw new Error("Request timed out: TimeoutError: The operation was aborted due to timeout");
    },
    generateDailyBody: async () => {
      dailyCalls += 1;
      return "こんばんちあ🌙 通常の夜投稿へ戻ったよ。";
    },
    info: () => {},
    warn: (...args) => warnings.push(args),
  });

  assert.equal(dailyCalls, 1);
  assert.equal(generated.body, "こんばんちあ🌙 通常の夜投稿へ戻ったよ。");
  assert.equal(generated.source, "ai");
  assert.equal(generated.discoveryCandidateSelected, true);
  assert.equal(generated.discoveryCandidateUsername, "Fate_to_Ash");
  assert.equal(generated.discoveryTimedOut, true);
  assert.equal(generated.discoveryFallbackToDaily, true);
  assert.equal(warnings[0][0], "chia_subjective_human_discovery_fallback");
  assert.equal(warnings[0][1].candidateSelected, true);
  assert.equal(warnings[0][1].candidateUsername, "Fate_to_Ash");
  assert.equal(warnings[0][1].isTimeout, true);
  assert.equal(warnings[0][1].fallbackToDaily, true);
});

test("通常AI生成も失敗した場合は既存固定fallbackへ到達する", async () => {
  const generated = await buildPostBody(
    { ...CONFIG, discoveryEnabled: false },
    EVENING,
    {
      generateDailyBody: async () => {
        throw new Error("ai_not_configured");
      },
      warn: () => {},
    },
  );

  assert.equal(generated.source, "fallback");
  assert.equal(generated.aiErrorCode, "ai_not_configured");
  assert.match(generated.body, /^こんばんちあ/);
});

test("同一slotの複数Background処理は既存claimにより投稿を1件に限定する", async () => {
  let claimed = false;
  let completionCalls = 0;
  const logs = [];
  const dependencies = {
    requestId: "background-request",
    readRuntimeConfig: () => ({
      ...CONFIG,
      enabled: true,
    }),
    createSupabaseClient: () => ({ tag: "admin-client" }),
    claim: async () => {
      if (claimed) {
        return { claimed: false, outcome: "already_posted" };
      }

      claimed = true;
      return { claimed: true, run_id: "run-id" };
    },
    loadProfile: async () => ({ id: CONFIG.chiaProfileId }),
    buildBody: async () => ({
      body: "こんばんちあ🌙 1件だけの流星便だよ。",
      source: "ai",
      aiErrorCode: null,
      discoveryAttempted: false,
      discoverySelected: false,
      discoveryCandidateSelected: false,
      discoveryCandidateUsername: null,
      discoveryGenerationSucceeded: false,
      discoveryTimedOut: false,
      discoveryFallbackToDaily: false,
    }),
    complete: async () => {
      completionCalls += 1;
      return { outcome: "posted", post_id: "post-id" };
    },
    syncMentions: async () => ({ created: 0, usernames: [] }),
    info: (...args) => logs.push(args),
    warn: () => {},
    errorLog: () => {},
  };

  const first = await runChiaDailyMeteor(EVENING, dependencies);
  const second = await runChiaDailyMeteor(EVENING, dependencies);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).outcome, "posted");
  assert.equal((await second.json()).outcome, "already_handled");
  assert.equal(completionCalls, 1);
  assert.equal(logs.some(([event]) => event === "chia_daily_meteor_background_already_handled"), true);
});

test("正常なdiscovery投稿は既存syncAiResidentPostMentions相当の経路へ渡る", async () => {
  let dailyCalls = 0;
  const generated = await buildPostBody(CONFIG, EVENING, {
    supabase: { tag: "admin-client" },
    selectDiscoveryCandidate: async ({ aiResidentKey, actorProfileId }) => {
      assert.equal(aiResidentKey, "hoshizora_chia");
      assert.equal(actorProfileId, CONFIG.chiaProfileId);
      return {
        profileId: "target-id",
        username: "TargetHuman",
        evidence: [{ analysisSummary: "作品の色づかいを観測した。" }],
      };
    },
    generateDiscoveryBody: async () => DISCOVERY_BODY,
    generateDailyBody: async () => {
      dailyCalls += 1;
      return "呼ばれてはいけない通常投稿";
    },
    info: () => {},
  });
  let received = null;
  const result = await syncCompletedPostMentions({
    supabase: { tag: "admin-client" },
    completion: { post_id: "post-id" },
    profile: { id: CONFIG.chiaProfileId },
    generated,
    syncMentions: async (input) => {
      received = input;
      return { created: 1, usernames: ["TargetHuman"] };
    },
  });

  assert.equal(generated.discoverySelected, true);
  assert.equal(generated.source, "ai");
  assert.equal(dailyCalls, 0);
  assert.deepEqual(received, {
    supabase: { tag: "admin-client" },
    postId: "post-id",
    actorProfileId: CONFIG.chiaProfileId,
    body: DISCOVERY_BODY,
  });
  assert.deepEqual(result, { created: 1, usernames: ["TargetHuman"] });
});
