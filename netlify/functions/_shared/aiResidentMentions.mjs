const PROFILE_MENTION_PATTERN = /@([A-Za-z0-9_]{1,64})/g;
const INVALID_PREFIX_PATTERN = /[A-Za-z0-9._%+-]/;
const INVALID_SUFFIX_PATTERN = /[A-Za-z0-9_-]/;

function isStandaloneMention(source, match) {
  const atIndex = match.index ?? -1;
  if (atIndex < 0) return false;

  const before = atIndex > 0 ? source[atIndex - 1] : "";
  const afterIndex = atIndex + match[0].length;
  const after = afterIndex < source.length ? source[afterIndex] : "";

  if (before && INVALID_PREFIX_PATTERN.test(before)) return false;
  if (after && INVALID_SUFFIX_PATTERN.test(after)) return false;
  return true;
}

export function extractProfileMentionUsernames(body) {
  const source = String(body || "");
  const usernames = new Set();
  for (const match of source.matchAll(PROFILE_MENTION_PATTERN)) {
    if (!isStandaloneMention(source, match)) continue;
    usernames.add(match[1]);
  }
  return [...usernames];
}

export async function syncAiResidentPostMentions({ supabase, postId, actorProfileId, body }) {
  const usernames = extractProfileMentionUsernames(body);
  if (!supabase || !postId || !actorProfileId || usernames.length === 0) {
    return { created: 0, usernames: [] };
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", usernames);

  if (profileError) {
    throw new Error(`mention_profile_lookup_failed:${profileError.code ?? "unknown"}`);
  }

  const profileIds = (profiles || []).map((profile) => profile.id);
  if (profileIds.length === 0) {
    return { created: 0, usernames: [] };
  }

  const { data: humanKinds, error: kindError } = await supabase
    .from("profile_kinds")
    .select("profile_id")
    .eq("kind", "human")
    .in("profile_id", profileIds);

  if (kindError) {
    throw new Error(`mention_profile_kind_lookup_failed:${kindError.code ?? "unknown"}`);
  }

  const humanIds = new Set((humanKinds || []).map((entry) => entry.profile_id));
  const rows = (profiles || [])
    .filter((profile) => humanIds.has(profile.id) && profile.id !== actorProfileId)
    .map((profile) => ({
      post_id: postId,
      mentioned_profile_id: profile.id,
      actor_profile_id: actorProfileId,
      token: `@${profile.username}`,
    }));

  if (rows.length === 0) {
    return { created: 0, usernames: [] };
  }

  const { data, error } = await supabase
    .from("post_mentions")
    .upsert(rows, { onConflict: "post_id,mentioned_profile_id", ignoreDuplicates: true })
    .select("mentioned_profile_id, token");

  if (error) {
    throw new Error(`mention_insert_failed:${error.code ?? "unknown"}`);
  }

  return {
    created: data?.length ?? rows.length,
    usernames: rows.map((row) => row.token.slice(1)),
  };
}
