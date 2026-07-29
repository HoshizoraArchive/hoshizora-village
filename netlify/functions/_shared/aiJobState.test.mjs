import assert from "node:assert/strict";
import test from "node:test";
import { completeAiObservationJob } from "./aiJobState.mjs";

const completionInput = {
  jobId: "11111111-1111-4111-8111-111111111111",
  chiaProfileId: "22222222-2222-4222-8222-222222222222",
  expectedRequestFingerprint: "a".repeat(64),
  observation: {
    observedPoints: [],
    analysisSummary: "観測結果",
    shouldPost: false,
    starLetter: null,
  },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, actualCostMicroUsd: 3 },
  autoStarLetterDailyLimit: 20,
  autoStarLetterAuthorCooldownSeconds: 21600,
  firstPostFallbackStarLetterBody: "村人さん、最初の流星便を受け取ったよ。ここからの星空も、ゆっくり見ているね。",
};

test("completion uses the new first-post RPC parameters when the migration is available", async () => {
  const calls = [];
  const result = await completeAiObservationJob({
    ...completionInput,
    supabase: {
      rpc(name, args) {
        calls.push({ name, args });
        return Promise.resolve({ data: [{ outcome: "completed" }], error: null });
      },
    },
  });

  assert.equal(result.outcome, "completed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_first_post_fallback_star_letter_body, completionInput.firstPostFallbackStarLetterBody);
  assert.equal(calls[0].args.p_is_first_post_fallback, false);
});

test("completion falls back to the legacy RPC signature when the additive migration is absent", async () => {
  const calls = [];
  const result = await completeAiObservationJob({
    ...completionInput,
    supabase: {
      rpc(name, args) {
        calls.push({ name, args });
        if (calls.length === 1) {
          return Promise.resolve({ data: null, error: { code: "PGRST202" } });
        }
        return Promise.resolve({ data: [{ outcome: "completed" }], error: null });
      },
    },
  });

  assert.equal(result.outcome, "completed");
  assert.equal(calls.length, 2);
  assert.equal("p_first_post_fallback_star_letter_body" in calls[1].args, false);
  assert.equal("p_is_first_post_fallback" in calls[1].args, false);
});
