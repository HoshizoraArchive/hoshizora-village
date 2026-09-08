import { runChiaStarLetterReply } from "./_shared/chiaStarLetterReply.mjs";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default async function handler(_request, context) {
  const requestId = context?.requestId ?? crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const result = await runChiaStarLetterReply();

    console.log("chia_star_letter_reply_completed", {
      requestId,
      outcome: result.outcome,
      sourceStarLetterId: result.sourceStarLetterId ?? null,
      replyStarLetterId: result.replyStarLetterId ?? null,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(200, {
      ...result,
      requestId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "unknown";

    console.error("chia_star_letter_reply_failed", {
      requestId,
      code,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(503, {
      outcome: "failed",
      code,
      requestId,
    });
  }
}

export const config = {
  schedule: "*/1 * * * *",
};
