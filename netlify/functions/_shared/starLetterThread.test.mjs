import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildStarLetterThreadRows,
  createOperationRequestIdStore,
  isStarLetterThreadNotification,
} from "../../../src/starLetterThread.js";

const POST_ID = "11111111-1111-4111-8111-111111111111";

function letter(id, parentStarLetterId = null, extras = {}) {
  return {
    id,
    postId: POST_ID,
    parentStarLetterId,
    body: `${id}の星文`,
    createdAt: `2026-07-28T00:00:0${id.slice(-1)}.000Z`,
    ...extras,
  };
}

test("star-letter thread keeps all relationship depth while using one visual indent", () => {
  const root = letter("00000000-0000-4000-8000-000000000001");
  const reply = letter("00000000-0000-4000-8000-000000000002", root.id);
  const deepReply = letter("00000000-0000-4000-8000-000000000003", reply.id);

  const rows = buildStarLetterThreadRows([deepReply, root, reply]);

  assert.deepEqual(rows.map((row) => row.id), [root.id, reply.id, deepReply.id]);
  assert.deepEqual(rows.map((row) => row.actualDepth), [0, 1, 2]);
  assert.deepEqual(rows.map((row) => row.displayDepth), [0, 1, 1]);
});

test("soft-deleted parents and replies whose physical parent disappeared remain visible", () => {
  const deletedParent = letter("00000000-0000-4000-8000-000000000004", null, { isDeleted: true });
  const child = letter("00000000-0000-4000-8000-000000000005", deletedParent.id);
  const orphan = letter("00000000-0000-4000-8000-000000000006", "00000000-0000-4000-8000-000000000999");

  const rows = buildStarLetterThreadRows([child, orphan, deletedParent]);

  assert.deepEqual(rows.map((row) => row.id), [deletedParent.id, child.id, orphan.id]);
  assert.equal(rows[0].isDeleted, true);
  assert.equal(rows[1].displayDepth, 1);
  assert.equal(rows[2].displayDepth, 0);
});

test("operation request ids are stable for retry and renewed after a successful action", () => {
  let nextId = 0;
  const requestIds = createOperationRequestIdStore(() => `request-${++nextId}`);

  assert.equal(requestIds.get("reply:a"), "request-1");
  assert.equal(requestIds.get("reply:a"), "request-1");
  requestIds.clear("reply:a");
  assert.equal(requestIds.get("reply:a"), "request-2");
});

test("only star-letter notifications with a target letter use the conversation route", () => {
  assert.equal(isStarLetterThreadNotification({ type: "star_letter_reply", star_letter_id: "letter" }), true);
  assert.equal(isStarLetterThreadNotification({ type: "star_letter_resonance", star_letter_id: "letter" }), true);
  assert.equal(isStarLetterThreadNotification({ type: "resonance", star_letter_id: "letter" }), false);
  assert.equal(isStarLetterThreadNotification({ type: "star_letter" }), false);
});

test("thread UI uses the existing conversation RPC layer and target URL without changing the legacy root composer", () => {
  const source = readFileSync("src/App.jsx", "utf8");

  for (const token of [
    "getStarLetterThread(supabase, postId)",
    "createStarLetterReply(supabase",
    "addStarLetterResonance(supabase",
    "setStarLetterArchived(supabase",
    "updateStarLetter(supabase",
    "deleteStarLetter(supabase",
    "buildStarLetterThreadRows(letters)",
    "?star_letter=",
    "star_letter_id, type",
    "この会話を見る",
    "星文を返す",
  ]) {
    assert.equal(source.includes(token), true, `missing thread UI integration: ${token}`);
  }

  assert.equal(source.includes('from("star_letter_resonances")'), false, "browser must use the RPC, not the resonance table");
  assert.match(
    source,
    /\.from\("star_letter_archives"\)[\s\S]{0,160}\.select\("id, profile_id, star_letter_id, post_id, created_at"\)/,
    "browser may read only the signed-in user's archived star letters",
  );
  assert.doesNotMatch(
    source,
    /\.from\("star_letter_archives"\)[\s\S]{0,180}\.(insert|update|upsert|delete)\(/,
    "browser mutations must continue to use the dedicated Archive RPC",
  );
});

test("thread UI exposes a direct retry action for recoverable fetch failures", () => {
  const source = readFileSync("src/App.jsx", "utf8");

  assert.equal(source.includes("onRetry: refreshStarLettersForPost"), true);
  assert.equal(source.includes("starLetters?.onRetry?.(postId)"), true);
  assert.equal(source.includes("再試行"), true);
});
