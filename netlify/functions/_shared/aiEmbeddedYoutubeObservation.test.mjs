import assert from "node:assert/strict";
import test from "node:test";
import {
  findEmbeddedYoutubeVideo,
  promoteEmbeddedYoutubePost,
} from "./aiObservationData.mjs";

const BASE_POST = {
  id: "22222222-2222-4222-8222-222222222222",
  author_id: "33333333-3333-4333-8333-333333333333",
  type: "text",
  visibility: "public",
  deleted_at: null,
  updated_at: "2026-08-07T10:34:28.244Z",
};

test("embedded youtu.be link is promoted to a YouTube observation input", () => {
  const body = "『不条理な命の巡環』です！良かったら聴いてね♪\nhttps://youtu.be/DebSQ5_BzEE?si=example";
  const embedded = findEmbeddedYoutubeVideo(body);
  const promoted = promoteEmbeddedYoutubePost({ ...BASE_POST, body });

  assert.deepEqual(embedded, {
    url: "https://youtu.be/DebSQ5_BzEE?si=example",
    videoId: "DebSQ5_BzEE",
  });
  assert.equal(promoted.type, "youtube");
  assert.equal(promoted.youtube_url, embedded.url);
  assert.equal(promoted.youtube_video_id, embedded.videoId);
  assert.equal(promoted.body, body);
});

test("YouTube URLs with trailing Japanese punctuation are normalized before observation", () => {
  const embedded = findEmbeddedYoutubeVideo("聴いてね https://www.youtube.com/watch?v=DebSQ5_BzEE）。");

  assert.deepEqual(embedded, {
    url: "https://www.youtube.com/watch?v=DebSQ5_BzEE",
    videoId: "DebSQ5_BzEE",
  });
});

test("non-YouTube links keep the post as text", () => {
  const post = { ...BASE_POST, body: "作品はこちら https://example.com/movie" };

  assert.equal(findEmbeddedYoutubeVideo(post.body), null);
  assert.equal(promoteEmbeddedYoutubePost(post), post);
});
