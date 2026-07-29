import { sanitizeAuthorCallName } from "./aiPrompt.mjs";

const WELCOME_CANDIDATE_RPC = "get_chia_first_post_welcome_candidate";

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function isMissingRpc(error) {
  return error?.code === "42883" || error?.code === "PGRST202";
}

export function buildFirstPostWelcomeFallback(authorProfile) {
  const authorCallName = sanitizeAuthorCallName(authorProfile);

  return `${authorCallName}、最初の流星便を受け取ったよ。ここに置いてくれた言葉から、これからの星空が始まるね。`;
}

export function buildFirstPostFallbackObservation() {
  return {
    observedPoints: [
      {
        kind: "text",
        observation: "最初の流星便として本文を受け取り、歓迎の星文を残します。",
      },
      { kind: "confidence", value: 1 },
    ],
    analysisSummary: "最初の流星便として本文を受け取りました。",
    shouldPost: false,
    starLetter: null,
    confidence: 1,
  };
}

export async function getFirstPostWelcomeCandidate({ supabase, postId }) {
  const { data, error } = await supabase.rpc(WELCOME_CANDIDATE_RPC, {
    p_post_id: postId,
  });

  // A deploy preview can run new Function code before its migration exists.
  // Keep ordinary automatic observation available; the completion RPC remains
  // the authoritative first-post decision once the migration is applied.
  if (isMissingRpc(error)) {
    return { isFirstPostWelcome: false, migrationAvailable: false };
  }

  if (error) {
    throw new Error("first_post_welcome_lookup_failed");
  }

  const row = firstRpcRow(data);

  if (typeof row?.is_first_post_welcome !== "boolean") {
    throw new Error("first_post_welcome_lookup_invalid");
  }

  return {
    isFirstPostWelcome: row.is_first_post_welcome,
    migrationAvailable: true,
  };
}

export { WELCOME_CANDIDATE_RPC };
