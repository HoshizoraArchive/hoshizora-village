const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const GLOBAL_COOLDOWN_HOURS = 72;
const TARGET_COOLDOWN_DAYS = 14;
const OBSERVATION_PAGE_SIZE = 500;
const MAX_OBSERVATION_ROWS = 5000;
const LOOKUP_BATCH_SIZE = 100;

export const DISCOVERY_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stableCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(values, size = LOOKUP_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalizeEvidenceValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function sanitizeDiscoveryEvidence(value, maxLength = 320) {
  const normalized = normalizeEvidenceValue(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[URL omitted]")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(normalized).slice(0, maxLength).join("");
}

function buildEvidence(observations) {
  return [...observations]
    .sort((left, right) => {
      const timestampDifference = new Date(right.created_at).getTime()
        - new Date(left.created_at).getTime();
      return timestampDifference || stableCompare(String(left.id || ""), String(right.id || ""));
    })
    .slice(0, 3)
    .map((observation) => ({
      analysisSummary: sanitizeDiscoveryEvidence(observation.analysis_summary, 240),
      observedPoints: sanitizeDiscoveryEvidence(observation.observed_points, 320),
      comment: sanitizeDiscoveryEvidence(observation.comment, 240),
    }))
    .filter((entry) => entry.analysisSummary || entry.observedPoints || entry.comment);
}

function recencyScore(lastObservedAt, now) {
  const observedAt = toDate(lastObservedAt);
  if (!observedAt) return 0;

  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  if (ageMs <= 2 * DAY_MS) return 3;
  if (ageMs <= 7 * DAY_MS) return 2;
  if (ageMs <= 14 * DAY_MS) return 1;
  return 0;
}

function normalizeDiscoveryData({ observations, posts, profiles, profileKinds }) {
  return {
    observations: Array.isArray(observations) ? observations : [],
    posts: Array.isArray(posts) ? posts : [],
    profiles: Array.isArray(profiles) ? profiles : [],
    profileKinds: Array.isArray(profileKinds) ? profileKinds : [],
  };
}

export function resolveAiResidentHumanDiscoveryCandidate({
  observations,
  posts,
  profiles,
  profileKinds,
  recentMentions = [],
  actorProfileId,
  now = new Date(),
}) {
  const referenceTime = toDate(now);
  if (!referenceTime || !actorProfileId) return null;

  const normalized = normalizeDiscoveryData({ observations, posts, profiles, profileKinds });
  const globalCutoff = referenceTime.getTime() - GLOBAL_COOLDOWN_HOURS * 60 * 60 * 1000;
  const targetCutoff = referenceTime.getTime() - TARGET_COOLDOWN_DAYS * DAY_MS;
  const lookbackCutoff = referenceTime.getTime() - LOOKBACK_DAYS * DAY_MS;
  const validRecentMentions = (Array.isArray(recentMentions) ? recentMentions : [])
    .map((mention) => ({ ...mention, timestamp: toDate(mention.created_at)?.getTime() }))
    .filter((mention) => Number.isFinite(mention.timestamp));

  if (validRecentMentions.some((mention) => mention.timestamp >= globalCutoff)) {
    return null;
  }

  const recentTargetIds = new Set(
    validRecentMentions
      .filter((mention) => mention.timestamp >= targetCutoff)
      .map((mention) => mention.mentioned_profile_id),
  );
  const postById = new Map(
    normalized.posts
      .filter((post) => post?.visibility === "public" && post?.deleted_at === null)
      .map((post) => [post.id, post]),
  );
  const profileById = new Map(normalized.profiles.map((profile) => [profile.id, profile]));
  const humanProfileIds = new Set(
    normalized.profileKinds
      .filter((entry) => entry?.kind === "human")
      .map((entry) => entry.profile_id),
  );
  const grouped = new Map();

  for (const observation of normalized.observations) {
    const observedAt = toDate(observation?.created_at);
    if (!observedAt || observedAt.getTime() < lookbackCutoff) continue;

    const post = postById.get(observation.post_id);
    if (!post) continue;

    const profileId = post.author_id;
    const profile = profileById.get(profileId);
    if (
      !profile
      || profileId === actorProfileId
      || recentTargetIds.has(profileId)
      || !humanProfileIds.has(profileId)
      || !DISCOVERY_USERNAME_PATTERN.test(String(profile.username || ""))
    ) {
      continue;
    }

    let aggregate = grouped.get(profileId);
    if (!aggregate) {
      aggregate = {
        profileId,
        username: profile.username,
        displayName: profile.display_name || profile.username,
        observedPostIds: new Set(),
        shouldCommentCount: 0,
        shouldRecommendCount: 0,
        lastObservedAt: observedAt.toISOString(),
        observations: [],
      };
      grouped.set(profileId, aggregate);
    }

    aggregate.observedPostIds.add(observation.post_id);
    if (observation.should_comment === true) aggregate.shouldCommentCount += 1;
    if (observation.should_recommend === true) aggregate.shouldRecommendCount += 1;
    if (observedAt.getTime() > new Date(aggregate.lastObservedAt).getTime()) {
      aggregate.lastObservedAt = observedAt.toISOString();
    }
    aggregate.observations.push(observation);
  }

  const candidates = [...grouped.values()]
    .map((aggregate) => {
      const distinctObservedPosts = aggregate.observedPostIds.size;
      const eligible = distinctObservedPosts >= 2
        && (aggregate.shouldCommentCount >= 2 || aggregate.shouldRecommendCount >= 1);
      if (!eligible) return null;

      return {
        profileId: aggregate.profileId,
        username: aggregate.username,
        displayName: aggregate.displayName,
        distinctObservedPosts,
        shouldCommentCount: aggregate.shouldCommentCount,
        shouldRecommendCount: aggregate.shouldRecommendCount,
        lastObservedAt: aggregate.lastObservedAt,
        score:
          aggregate.shouldRecommendCount * 10
          + aggregate.shouldCommentCount * 4
          + distinctObservedPosts * 2
          + recencyScore(aggregate.lastObservedAt, referenceTime),
        evidence: buildEvidence(aggregate.observations),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const observedDifference = new Date(right.lastObservedAt).getTime()
        - new Date(left.lastObservedAt).getTime();
      if (observedDifference) return observedDifference;
      return stableCompare(String(left.profileId), String(right.profileId));
    });

  return candidates[0] ?? null;
}

async function fetchRecentMentions({ supabase, actorProfileId, now }) {
  const cutoff = new Date(now.getTime() - TARGET_COOLDOWN_DAYS * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from("post_mentions")
    .select("mentioned_profile_id, created_at")
    .eq("actor_profile_id", actorProfileId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`discovery_mention_history_failed:${error.code ?? "unknown"}`);
  }

  return data || [];
}

async function fetchObservations({ supabase, aiResidentKey, now }) {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const observations = [];

  for (let from = 0; from < MAX_OBSERVATION_ROWS; from += OBSERVATION_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("observations")
      .select(
        "id, post_id, analysis_summary, observed_points, should_comment, should_recommend, comment, created_at",
      )
      .eq("observer_type", "ai_resident")
      .eq("ai_resident_key", aiResidentKey)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + OBSERVATION_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`discovery_observation_query_failed:${error.code ?? "unknown"}`);
    }

    const page = data || [];
    observations.push(...page);
    if (page.length < OBSERVATION_PAGE_SIZE) return observations;
  }

  throw new Error("discovery_observation_limit_exceeded");
}

async function fetchRowsInBatches({ values, query, errorPrefix }) {
  const rows = [];
  for (const batch of chunks(unique(values))) {
    const { data, error } = await query(batch);
    if (error) {
      throw new Error(`${errorPrefix}:${error.code ?? "unknown"}`);
    }
    rows.push(...(data || []));
  }
  return rows;
}

export async function selectAiResidentHumanDiscoveryCandidate({
  supabase,
  aiResidentKey,
  actorProfileId,
  now = new Date(),
}) {
  const referenceTime = toDate(now);
  if (!supabase || !referenceTime || !String(aiResidentKey || "").trim() || !actorProfileId) {
    throw new Error("invalid_discovery_selector_configuration");
  }

  const recentMentions = await fetchRecentMentions({
    supabase,
    actorProfileId,
    now: referenceTime,
  });
  const globalCutoff = referenceTime.getTime() - GLOBAL_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (recentMentions.some((mention) => {
    const timestamp = toDate(mention.created_at)?.getTime();
    return Number.isFinite(timestamp) && timestamp >= globalCutoff;
  })) {
    return null;
  }

  const observations = await fetchObservations({
    supabase,
    aiResidentKey: String(aiResidentKey).trim(),
    now: referenceTime,
  });
  if (observations.length === 0) return null;

  const postIds = unique(observations.map((observation) => observation.post_id));
  const posts = await fetchRowsInBatches({
    values: postIds,
    errorPrefix: "discovery_post_query_failed",
    query: (batch) => supabase
      .from("posts")
      .select("id, author_id, visibility, deleted_at")
      .in("id", batch)
      .eq("visibility", "public")
      .is("deleted_at", null),
  });
  if (posts.length === 0) return null;

  const authorIds = unique(posts.map((post) => post.author_id));
  const profileKinds = await fetchRowsInBatches({
    values: authorIds,
    errorPrefix: "discovery_profile_kind_query_failed",
    query: (batch) => supabase
      .from("profile_kinds")
      .select("profile_id, kind")
      .eq("kind", "human")
      .in("profile_id", batch),
  });
  const humanProfileIds = new Set(profileKinds.map((entry) => entry.profile_id));
  const profiles = await fetchRowsInBatches({
    values: authorIds.filter((profileId) => humanProfileIds.has(profileId)),
    errorPrefix: "discovery_profile_query_failed",
    query: (batch) => supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", batch),
  });

  return resolveAiResidentHumanDiscoveryCandidate({
    observations,
    posts,
    profiles,
    profileKinds,
    recentMentions,
    actorProfileId,
    now: referenceTime,
  });
}
