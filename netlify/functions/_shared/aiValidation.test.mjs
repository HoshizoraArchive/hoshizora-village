import assert from "node:assert/strict";
import test from "node:test";
import {
  extractYoutubeVideoId,
  getStorageRequirements,
  validateObservationRequestPayload,
  validatePostMedia,
  validatePublicPost,
  validateStorageMetadata,
} from "./aiValidation.mjs";

const POST_ID = "22222222-2222-4222-8222-222222222222";
const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";

function publicPost(overrides = {}) {
  return {
    id: POST_ID,
    author_id: AUTHOR_ID,
    type: "text",
    visibility: "public",
    deleted_at: null,
    youtube_url: null,
    youtube_video_id: null,
    ...overrides,
  };
}

function imageRow(overrides = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    post_id: POST_ID,
    uploader_id: AUTHOR_ID,
    media_type: "image",
    storage_path: `${AUTHOR_ID}/batch/0-image.jpg`,
    sort_order: 0,
    mime_type: "image/jpeg",
    size_bytes: "1024",
    duration_seconds: null,
    ...overrides,
  };
}

test("request payload rejects extra fields", () => {
  assert.throws(
    () => validateObservationRequestPayload({
      postId: POST_ID,
      idempotencyKey: "a".repeat(32),
      model: "client-controlled",
    }),
    (error) => error.status === 400 && error.code === "BAD_REQUEST",
  );
});

test("request payload accepts only UUID post IDs and long idempotency keys", () => {
  assert.deepEqual(
    validateObservationRequestPayload({
      postId: POST_ID.toUpperCase(),
      idempotencyKey: "request-123456789012345678901234",
    }),
    {
      postId: POST_ID,
      idempotencyKey: "request-123456789012345678901234",
    },
  );
});

test("public post validation rejects deleted or private posts", () => {
  assert.throws(
    () => validatePublicPost(publicPost({ deleted_at: "2026-07-03T00:00:00Z" })),
    (error) => error.status === 404,
  );

  assert.throws(
    () => validatePublicPost(publicPost({ visibility: "private" })),
    (error) => error.status === 404,
  );
});

test("youtube validation accepts only known YouTube hosts and video IDs", () => {
  assert.equal(extractYoutubeVideoId("https://youtu.be/abcdefghijk?si=test"), "abcdefghijk");
  assert.equal(extractYoutubeVideoId("https://www.youtube.com/shorts/ABCDEFGHIJK"), "ABCDEFGHIJK");
  assert.equal(extractYoutubeVideoId("https://example.com/watch?v=abcdefghijk"), null);
  assert.equal(extractYoutubeVideoId("http://localhost/watch?v=abcdefghijk"), null);
});

test("image media validation checks ownership, limits, and storage metadata", () => {
  const post = publicPost({ type: "image" });
  const row = imageRow();
  const summary = validatePostMedia(post, [row]);
  const requirements = getStorageRequirements(post, [row]);

  assert.deepEqual(summary, {
    inputKind: "image",
    inputSizeBytes: 1024,
    inputDurationSeconds: null,
  });
  assert.equal(requirements.length, 1);
  assert.doesNotThrow(() => validateStorageMetadata(requirements, [
    {
      bucket: "meteor-media",
      storagePath: row.storage_path,
      metadata: {
        mimetype: "image/jpeg",
        size: "1024",
      },
    },
  ]));
});

test("storage metadata mismatch is rejected", () => {
  const post = publicPost({ type: "image" });
  const row = imageRow();
  const requirements = getStorageRequirements(post, [row]);

  assert.throws(
    () => validateStorageMetadata(requirements, [
      {
        bucket: "meteor-media",
        storagePath: row.storage_path,
        metadata: {
          mimetype: "image/png",
          size: "1024",
        },
      },
    ]),
    (error) => error.status === 422 && error.code === "UNSUPPORTED_MEDIA",
  );
});

test("audio posts fail closed until server-verifiable metadata exists", () => {
  const post = publicPost({ type: "audio", media_url: "https://example.com/audio.mp3", duration_seconds: 20 });

  assert.throws(
    () => validatePostMedia(post, []),
    (error) => error.status === 422 && error.code === "UNSUPPORTED_MEDIA",
  );
});
