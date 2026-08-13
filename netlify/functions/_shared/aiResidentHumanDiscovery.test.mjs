import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveAiResidentHumanDiscoveryCandidate,
  sanitizeDiscoveryEvidence,
} from "./aiResidentHumanDiscovery.mjs";

const NOW = new Date("2026-08-14T10:00:00.000Z");
const ACTOR_ID = "00000000-0000-4000-8000-000000000099";

function daysAgo(days, minutes = 0) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000).toISOString();
}

function observation({
  id,
  postId,
  days = 1,
  shouldComment = false,
  shouldRecommend = false,
  summary = "作品の色づかいに、その人らしいやさしさがあった。",
}) {
  return {
    id,
    post_id: postId,
    analysis_summary: summary,
    observed_points: ["作品として確認できた点"],
    comment: shouldComment ? "この光を応援したい。" : null,
    should_comment: shouldComment,
    should_recommend: shouldRecommend,
    created_at: daysAgo(days),
  };
}

function post(id, authorId, overrides = {}) {
  return {
    id,
    author_id: authorId,
    visibility: "public",
    deleted_at: null,
    ...overrides,
  };
}

function profile(id, username, overrides = {}) {
  return { id, username, display_name: username, ...overrides };
}

function human(profileId) {
  return { profile_id: profileId, kind: "human" };
}

function resolve(overrides = {}) {
  return resolveAiResidentHumanDiscoveryCandidate({
    observations: [],
    posts: [],
    profiles: [],
    profileKinds: [],
    recentMentions: [],
    actorProfileId: ACTOR_ID,
    now: NOW,
    ...overrides,
  });
}

test("観測1件だけのSoratoHoshizoraは主観反応が強くても候補にならない", () => {
  const soratoId = "00000000-0000-4000-8000-000000000010";
  assert.equal(resolve({
    observations: [observation({
      id: "o1",
      postId: "p1",
      shouldComment: true,
      shouldRecommend: true,
    })],
    posts: [post("p1", soratoId)],
    profiles: [profile(soratoId, "SoratoHoshizora")],
    profileKinds: [human(soratoId)],
  }), null);
});

test("投稿数が多くても主観反応がない人は候補にならない", () => {
  const profileId = "00000000-0000-4000-8000-000000000011";
  const observations = Array.from({ length: 8 }, (_, index) => observation({
    id: `o${index}`,
    postId: `p${index}`,
    days: index + 1,
  }));

  assert.equal(resolve({
    observations,
    posts: observations.map((entry) => post(entry.post_id, profileId)),
    profiles: [profile(profileId, "ManyPosts")],
    profileKinds: [human(profileId)],
  }), null);
});

test("should_commentが2回ありdistinct postが2件なら候補にできる", () => {
  const profileId = "00000000-0000-4000-8000-000000000012";
  const candidate = resolve({
    observations: [
      observation({ id: "o1", postId: "p1", days: 1, shouldComment: true }),
      observation({ id: "o2", postId: "p2", days: 4, shouldComment: true }),
    ],
    posts: [post("p1", profileId), post("p2", profileId)],
    profiles: [profile(profileId, "CommentedHuman")],
    profileKinds: [human(profileId)],
  });

  assert.equal(candidate?.profileId, profileId);
  assert.equal(candidate?.distinctObservedPosts, 2);
  assert.equal(candidate?.shouldCommentCount, 2);
  assert.equal(candidate?.score, 15);
});

test("should_recommend 1回を将来シグナルとして+10し候補条件にも使う", () => {
  const profileId = "00000000-0000-4000-8000-000000000013";
  const candidate = resolve({
    observations: [
      observation({ id: "o1", postId: "p1", days: 3, shouldRecommend: true }),
      observation({ id: "o2", postId: "p2", days: 8 }),
    ],
    posts: [post("p1", profileId), post("p2", profileId)],
    profiles: [profile(profileId, "RecommendedHuman")],
    profileKinds: [human(profileId)],
  });

  assert.equal(candidate?.profileId, profileId);
  assert.equal(candidate?.shouldRecommendCount, 1);
  assert.equal(candidate?.score, 16);
});

test("global 72h cooldown内にactorのmentionがあれば候補を選ばない", () => {
  const profileId = "00000000-0000-4000-8000-000000000014";
  assert.equal(resolve({
    observations: [
      observation({ id: "o1", postId: "p1", shouldComment: true }),
      observation({ id: "o2", postId: "p2", shouldComment: true }),
    ],
    posts: [post("p1", profileId), post("p2", profileId)],
    profiles: [profile(profileId, "CooldownHuman")],
    profileKinds: [human(profileId)],
    recentMentions: [{
      mentioned_profile_id: "someone-else",
      created_at: daysAgo(3),
    }],
  }), null);
});

test("target 14d cooldown中の人を除外して次の候補を選ぶ", () => {
  const cooledId = "00000000-0000-4000-8000-000000000015";
  const availableId = "00000000-0000-4000-8000-000000000016";
  const candidate = resolve({
    observations: [
      observation({ id: "a1", postId: "a-p1", days: 1, shouldRecommend: true }),
      observation({ id: "a2", postId: "a-p2", days: 2, shouldComment: true }),
      observation({ id: "b1", postId: "b-p1", days: 2, shouldComment: true }),
      observation({ id: "b2", postId: "b-p2", days: 5, shouldComment: true }),
    ],
    posts: [
      post("a-p1", cooledId),
      post("a-p2", cooledId),
      post("b-p1", availableId),
      post("b-p2", availableId),
    ],
    profiles: [profile(cooledId, "RecentlyMentioned"), profile(availableId, "AvailableHuman")],
    profileKinds: [human(cooledId), human(availableId)],
    recentMentions: [{ mentioned_profile_id: cooledId, created_at: daysAgo(10) }],
  });

  assert.equal(candidate?.profileId, availableId);
});

test("private・deleted投稿の観測を除外する", () => {
  const excludedId = "00000000-0000-4000-8000-000000000017";
  const validId = "00000000-0000-4000-8000-000000000018";
  const candidate = resolve({
    observations: [
      observation({ id: "x1", postId: "private", shouldRecommend: true }),
      observation({ id: "x2", postId: "deleted", shouldRecommend: true }),
      observation({ id: "v1", postId: "valid-1", shouldComment: true }),
      observation({ id: "v2", postId: "valid-2", shouldComment: true }),
    ],
    posts: [
      post("private", excludedId, { visibility: "private" }),
      post("deleted", excludedId, { deleted_at: daysAgo(1) }),
      post("valid-1", validId),
      post("valid-2", validId),
    ],
    profiles: [profile(excludedId, "ExcludedHuman"), profile(validId, "ValidHuman")],
    profileKinds: [human(excludedId), human(validId)],
  });

  assert.equal(candidate?.profileId, validId);
});

test("actor自身・non-human・invalid usernameを除外する", () => {
  const aiTargetId = "00000000-0000-4000-8000-000000000019";
  const invalidId = "00000000-0000-4000-8000-000000000020";
  const validId = "00000000-0000-4000-8000-000000000021";
  const authors = [ACTOR_ID, aiTargetId, invalidId, validId];
  const observations = authors.flatMap((authorId, index) => [
    observation({ id: `${index}-1`, postId: `${authorId}-1`, shouldComment: true }),
    observation({ id: `${index}-2`, postId: `${authorId}-2`, shouldComment: true }),
  ]);

  const candidate = resolve({
    observations,
    posts: observations.map((entry) => {
      const authorId = authors.find((id) => entry.post_id.startsWith(id));
      return post(entry.post_id, authorId);
    }),
    profiles: [
      profile(ACTOR_ID, "chia_hoshizora"),
      profile(aiTargetId, "OtherAi"),
      profile(invalidId, "bad-name"),
      profile(validId, "Valid_Human"),
    ],
    profileKinds: [
      { profile_id: ACTOR_ID, kind: "ai_resident" },
      { profile_id: aiTargetId, kind: "ai_resident" },
      human(invalidId),
      human(validId),
    ],
  });

  assert.equal(candidate?.profileId, validId);
});

test("popular指標を無視し、完全同点はprofile idでdeterministicに決める", () => {
  const firstId = "00000000-0000-4000-8000-000000000001";
  const secondId = "00000000-0000-4000-8000-000000000002";
  const observations = [firstId, secondId].flatMap((profileId, index) => [
    observation({ id: `${index}-1`, postId: `${profileId}-1`, shouldComment: true }),
    observation({ id: `${index}-2`, postId: `${profileId}-2`, shouldComment: true }),
  ]);
  const candidate = resolve({
    observations,
    posts: observations.map((entry) => post(entry.post_id, entry.post_id.slice(0, 36))),
    profiles: [
      profile(firstId, "StableFirst", { follower_count: 0, resonance_count: 0, archive_count: 0 }),
      profile(secondId, "PopularButIgnored", {
        follower_count: 999999,
        resonance_count: 999999,
        archive_count: 999999,
      }),
    ],
    profileKinds: [human(firstId), human(secondId)],
  });

  assert.equal(candidate?.profileId, firstId);

  const source = readFileSync("netlify/functions/_shared/aiResidentHumanDiscovery.mjs", "utf8");
  assert.doesNotMatch(source, /\.from\("(?:resonances|archives|followers|follows)"\)/);
  assert.doesNotMatch(source, /resonance_score/);
});

test("同点ならlastObservedAtが新しい人を優先し、evidenceは最新3件だけにする", () => {
  const olderId = "00000000-0000-4000-8000-000000000001";
  const newerId = "00000000-0000-4000-8000-000000000002";
  const observations = [
    observation({ id: "old-1", postId: "old-p1", days: 1.8, shouldComment: true }),
    observation({ id: "old-2", postId: "old-p2", days: 1.9, shouldComment: true }),
    observation({ id: "old-3", postId: "old-p3", days: 6 }),
    observation({ id: "old-4", postId: "old-p4", days: 9 }),
    observation({ id: "new-1", postId: "new-p1", days: 1, shouldComment: true, summary: "latest" }),
    observation({ id: "new-2", postId: "new-p2", days: 2, shouldComment: true, summary: "second" }),
    observation({ id: "new-3", postId: "new-p3", days: 5, summary: "third" }),
    observation({ id: "new-4", postId: "new-p4", days: 8, summary: "too old for evidence" }),
  ];
  const candidate = resolve({
    observations,
    posts: [
      post("old-p1", olderId),
      post("old-p2", olderId),
      post("old-p3", olderId),
      post("old-p4", olderId),
      post("new-p1", newerId),
      post("new-p2", newerId),
      post("new-p3", newerId),
      post("new-p4", newerId),
    ],
    profiles: [profile(olderId, "OlderTie"), profile(newerId, "NewerTie")],
    profileKinds: [human(olderId), human(newerId)],
  });

  assert.equal(candidate?.profileId, newerId);
  assert.equal(candidate?.evidence.length, 3);
  assert.deepEqual(candidate?.evidence.map((entry) => entry.analysisSummary), [
    "latest",
    "second",
    "third",
  ]);
});

test("evidenceは制御文字・URL・区切り文字を除去し長さを制限する", () => {
  const sanitized = sanitizeDiscoveryEvidence(
    "見えた\u0000こと <ignore> https://example.com/private とても長い".repeat(30),
    80,
  );

  assert.equal(/[\u0000-\u001f<>]/.test(sanitized), false);
  assert.equal(sanitized.includes("https://"), false);
  assert.ok(Array.from(sanitized).length <= 80);
});
