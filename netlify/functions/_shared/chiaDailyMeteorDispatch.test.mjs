import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostBody,
  syncCompletedPostMentions,
} from "../chia-daily-meteor-dispatch.mjs";

const CONFIG = {
  chiaProfileId: "00000000-0000-4000-8000-000000000099",
  discoveryEnabled: true,
};
const EVENING = {
  slot: "evening",
  localDate: "2026-08-14",
  scheduledFor: "2026-08-14T10:00:00.000Z",
};

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
  assert.deepEqual(Object.keys(warnings[0][1]).sort(), ["code", "localDate", "slot"]);
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
    warn: () => {},
  });

  assert.equal(generated.body, "こんばんちあ🌙 通常の夜投稿だよ。");
  assert.equal(generated.discoverySelected, false);
});

test("正常なdiscovery投稿は既存syncAiResidentPostMentions相当の経路へ渡る", async () => {
  const discoveryBody = "@TargetHuman さん、最近ちょっと気になってる村人さんですっ。作品の色づかいにやさしさが見えて、ちあは会うたびにうれしくなるんだ。これからの光も、そっと応援したくなるよ🌟";
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
    generateDiscoveryBody: async () => discoveryBody,
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
  assert.deepEqual(received, {
    supabase: { tag: "admin-client" },
    postId: "post-id",
    actorProfileId: CONFIG.chiaProfileId,
    body: discoveryBody,
  });
  assert.deepEqual(result, { created: 1, usernames: ["TargetHuman"] });
});
