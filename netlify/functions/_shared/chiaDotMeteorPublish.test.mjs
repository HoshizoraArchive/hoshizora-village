import assert from "node:assert/strict";
import test from "node:test";
import {
  claimChiaDotMeteorRun,
  completeChiaDotMeteorRun,
  failChiaDotMeteorRun,
  publishChiaDotMeteor,
  repairChiaDotMeteorMentions,
  validateChiaDotMeteorBody,
} from "./chiaDotMeteorPublish.mjs";

const CHIA = "00000000-0000-4000-8000-000000000001";
const SLOT = {
  slot: "morning",
  localDate: "2026-10-05",
  scheduledFor: "2026-10-04T23:00:00.000Z",
};

test("危険なbody・URL/hashtag・複数mention・500文字超過を拒否する", () => {
  assert.equal(validateChiaDotMeteorBody(""), null);
  assert.equal(validateChiaDotMeteorBody(" 前後空白 "), null);
  assert.equal(validateChiaDotMeteorBody("https://example.com"), null);
  assert.equal(validateChiaDotMeteorBody("#宣伝 だよ"), null);
  assert.equal(validateChiaDotMeteorBody("今日は#宣伝だよ"), null);
  assert.equal(validateChiaDotMeteorBody("AIが生成しました"), null);
  assert.equal(validateChiaDotMeteorBody("@alice と @bob の話"), null);
  assert.equal(validateChiaDotMeteorBody("@alice さん、また @alice さん"), null);
  assert.equal(validateChiaDotMeteorBody("あ".repeat(501)), null);
  assert.deepEqual(validateChiaDotMeteorBody("おはちあ！ @alice さん、おはよう"), {
    body: "おはちあ！ @alice さん、おはよう",
    mentions: ["alice"],
  });
});

test("Dot publishはlegacy claim RPCではなくDot専用claim RPCを使う", async () => {
  let call = null;
  const result = await claimChiaDotMeteorRun({
    rpc: async (name, args) => {
      call = { name, args };
      return { data: { claimed: true, outcome: "claimed", run_id: "run-1" }, error: null };
    },
  }, SLOT);
  assert.equal(call.name, "claim_chia_daily_meteor_dot_run");
  assert.deepEqual(call.args, {
    p_local_date: SLOT.localDate,
    p_slot: SLOT.slot,
    p_scheduled_for: SLOT.scheduledFor,
  });
  assert.equal(result.run_id, "run-1");
});

test("Dot complete/failはclaim_ownerを検証する専用fenced RPCだけを使う", async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "complete_chia_daily_meteor_dot_run") {
        return { data: { outcome: "posted", post_id: "post-1" }, error: null };
      }
      if (name === "fail_chia_daily_meteor_dot_run") {
        return { data: { outcome: "failed" }, error: null };
      }
      throw new Error(`unexpected_rpc:${name}`);
    },
  };
  const generated = { body: "おはちあ！", source: "ai", aiErrorCode: null };
  const completion = await completeChiaDotMeteorRun({
    supabase,
    runId: "run-1",
    authorId: CHIA,
    generated,
  });
  await failChiaDotMeteorRun(supabase, "run-2", "lease_test");

  assert.equal(completion.post_id, "post-1");
  assert.deepEqual(calls, [
    {
      name: "complete_chia_daily_meteor_dot_run",
      args: {
        p_run_id: "run-1",
        p_author_id: CHIA,
        p_body: generated.body,
        p_source: "ai",
        p_error_code: null,
      },
    },
    {
      name: "fail_chia_daily_meteor_dot_run",
      args: { p_run_id: "run-2", p_error_code: "lease_test" },
    },
  ]);
});

test("ネットワーク不明時の再送はalready_handledでも同じpostのmention修復を再実行する", async () => {
  let runCalls = 0;
  let repairCalls = 0;
  const runDailyMeteor = async () => {
    runCalls += 1;
    return new Response(JSON.stringify({
      outcome: runCalls === 1 ? "posted" : "already_handled",
      postId: "post-1",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const repairMentions = async () => {
    repairCalls += 1;
    return { postId: "post-1", source: "ai", body: args.body, mentionCount: repairCalls === 1 ? 1 : 0, mentionedUsernames: ["alice"] };
  };
  const args = {
    supabase: {},
    slotInfo: SLOT,
    body: "おはちあ！ @alice さんの言葉が今朝も残ってるよ。",
    chiaProfileId: CHIA,
    requestId: "req",
    runDailyMeteor,
    validateMentionTargets: async () => {},
    allowedMentionUsernames: ["alice"],
    repairMentions,
    info: () => {},
    warn: () => {},
    errorLog: () => {},
  };
  const first = await publishChiaDotMeteor(args);
  const second = await publishChiaDotMeteor(args);
  assert.equal(first.status, 200);
  assert.equal(first.payload.outcome, "posted");
  assert.equal(second.status, 200);
  assert.equal(second.payload.outcome, "already_handled");
  assert.equal(first.payload.postId, "post-1");
  assert.equal(second.payload.postId, "post-1");
  assert.equal(runCalls, 2);
  assert.equal(repairCalls, 2);
});

test("投稿完了後にmention同期だけ失敗した場合は503で再送を要求する", async () => {
  const result = await publishChiaDotMeteor({
    supabase: {},
    slotInfo: SLOT,
    body: "おはちあ！ @alice さんの言葉が気になってるよ。",
    chiaProfileId: CHIA,
    requestId: "req",
    runDailyMeteor: async () => new Response(JSON.stringify({ outcome: "posted", postId: "post-1" }), { status: 200 }),
    validateMentionTargets: async () => {},
    allowedMentionUsernames: ["alice"],
    repairMentions: async () => { throw new Error("mention_insert_failed:timeout"); },
    info: () => {},
    warn: () => {},
    errorLog: () => {},
  });
  assert.equal(result.status, 503);
  assert.equal(result.payload.outcome, "mentions_pending");
  assert.equal(result.payload.postId, "post-1");
});

test("repairはposted runのbodyを使って既存mention upsert経路だけを再実行する", async () => {
  let synced = null;
  const chain = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return { data: { status: "posted", post_id: "post-1", body: "@alice おはちあ！", source: "ai" }, error: null };
    },
  };
  const result = await repairChiaDotMeteorMentions({
    supabase: { from: () => chain },
    slotInfo: SLOT,
    chiaProfileId: CHIA,
    syncMentions: async (input) => {
      synced = input;
      return { created: 1, usernames: ["alice"] };
    },
  });
  assert.equal(synced.postId, "post-1");
  assert.equal(synced.actorProfileId, CHIA);
  assert.equal(synced.body, "@alice おはちあ！");
  assert.deepEqual(result, { postId: "post-1", source: "ai", body: "@alice おはちあ！", mentionCount: 1, mentionedUsernames: ["alice"] });
});

test("snapshotにいないmentionと根拠なしmedia claimを拒否する", async () => {
  const base = {
    supabase: {}, slotInfo: SLOT, chiaProfileId: CHIA, requestId: "req",
    runDailyMeteor: async () => new Response(JSON.stringify({ outcome: "posted" }), { status: 200 }),
    validateMentionTargets: async () => {}, repairMentions: async () => ({}),
    info: () => {}, warn: () => {}, errorLog: () => {},
  };
  const mention = await publishChiaDotMeteor({ ...base, body: "@alice おはちあ！", allowedMentionUsernames: [] });
  assert.equal(mention.status, 400);
  assert.equal(mention.payload.code, "chia_dot_publish_mention_not_in_snapshot");
  const media = await publishChiaDotMeteor({ ...base, body: "この動画を観たよ。", allowedMentionUsernames: [] });
  assert.equal(media.status, 400);
  assert.equal(media.payload.code, "chia_dot_publish_ungrounded_media_claim");
  const grounded = await publishChiaDotMeteor({
    ...base,
    body: "この動画を観たよ。",
    allowedMentionUsernames: [],
    allowedMediaEvidenceKeys: ["b".repeat(64)],
    mediaEvidenceKey: "b".repeat(64),
    repairMentions: async () => ({ postId: "post-1", source: "ai", body: "この動画を観たよ。", mentionCount: 0, mentionedUsernames: [] }),
  });
  assert.equal(grounded.status, 200);
});
