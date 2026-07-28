import assert from "node:assert/strict";
import test from "node:test";
import {
  addStarLetterResonance,
  createStarLetterReply,
  deleteStarLetter,
  getStarLetterThread,
  setStarLetterArchived,
  updateStarLetter,
} from "../../../src/starLetterConversations.js";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const LETTER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function createRpcClient(responses) {
  const calls = [];

  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return responses[name] ?? { data: null, error: null };
    },
  };
}

test("thread retrieval exposes the normalized reply and interaction summary shape", async () => {
  const client = createRpcClient({
    get_star_letter_thread: {
      data: [{
        id: LETTER_ID,
        post_id: POST_ID,
        parent_star_letter_id: null,
        is_deleted: false,
        total_resonance_count: 4,
        viewer_resonance_count: 2,
        is_archived: true,
      }],
      error: null,
    },
  });

  const result = await getStarLetterThread(client, POST_ID);

  assert.equal(result[0].parent_star_letter_id, null);
  assert.equal(result[0].total_resonance_count, 4);
  assert.equal(result[0].viewer_resonance_count, 2);
  assert.equal(result[0].is_archived, true);
});

test("reply creation passes only normalized server-owned relationship arguments", async () => {
  const client = createRpcClient({
    create_star_letter_reply: {
      data: [{ outcome: "created", star_letter_id: LETTER_ID, post_id: POST_ID }],
      error: null,
    },
  });

  await createStarLetterReply(client, {
    parentStarLetterId: LETTER_ID,
    body: "  同じ流星便の星文へ返信します。  ",
    clientRequestId: REQUEST_ID,
  });

  assert.deepEqual(client.calls[0], {
    name: "create_star_letter_reply",
    args: {
      p_parent_star_letter_id: LETTER_ID,
      p_body: "同じ流星便の星文へ返信します。",
      p_client_request_id: REQUEST_ID,
    },
  });
  assert.equal("author_id" in client.calls[0].args, false);
  assert.equal("post_id" in client.calls[0].args, false);
});

test("edit, delete, repeated resonance, and archive use the dedicated RPCs", async () => {
  const client = createRpcClient({
    update_star_letter: { data: [{ outcome: "updated", star_letter_id: LETTER_ID }], error: null },
    delete_star_letter: { data: [{ outcome: "soft_deleted", star_letter_id: LETTER_ID }], error: null },
    add_star_letter_resonance: {
      data: [{
        outcome: "created",
        resonance_id: REQUEST_ID,
        total_resonance_count: 2,
        viewer_resonance_count: 2,
      }],
      error: null,
    },
    set_star_letter_archive: {
      data: [{ outcome: "archived", archive_id: REQUEST_ID, post_id: POST_ID, is_archived: true }],
      error: null,
    },
  });

  await updateStarLetter(client, { starLetterId: LETTER_ID, body: "編集した星文です。" });
  await deleteStarLetter(client, LETTER_ID);
  await addStarLetterResonance(client, { starLetterId: LETTER_ID, clientRequestId: REQUEST_ID });
  await setStarLetterArchived(client, { starLetterId: LETTER_ID, archived: true });

  assert.deepEqual(client.calls.map(({ name }) => name), [
    "update_star_letter",
    "delete_star_letter",
    "add_star_letter_resonance",
    "set_star_letter_archive",
  ]);
});

test("unexpected RPC outcomes fail closed", async () => {
  const client = createRpcClient({
    create_star_letter_reply: {
      data: [{ outcome: "not_found" }],
      error: null,
    },
  });

  await assert.rejects(
    createStarLetterReply(client, {
      parentStarLetterId: LETTER_ID,
      body: "見えない対象への返信です。",
      clientRequestId: REQUEST_ID,
    }),
    { code: "STAR_LETTER_RPC_OUTCOME_INVALID" },
  );
});
