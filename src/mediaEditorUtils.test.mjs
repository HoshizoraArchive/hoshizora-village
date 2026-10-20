import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  METEOR_IMAGE_MAX_COUNT,
  METEOR_VIDEO_MAX_DURATION_SECONDS,
  YOUTUBE_VIDEO_ID_PATTERN,
  clampNumber,
  constrainAvatarCropOffset,
  constrainPostCoverCropOffset,
  formatFileSize,
  formatMediaDuration,
  getAvatarCoverScale,
  getPostCoverCropScale,
} from "./lib/mediaEditorUtils.js";

test("the shared media constraints preserve the original crop and attachment limits", () => {
  assert.equal(AVATAR_CROP_MIN_ZOOM, 1);
  assert.equal(AVATAR_CROP_MAX_ZOOM, 6);
  assert.equal(METEOR_IMAGE_MAX_COUNT, 4);
  assert.equal(METEOR_VIDEO_MAX_DURATION_SECONDS, 35);
  assert.equal(YOUTUBE_VIDEO_ID_PATTERN.test("dQw4w9WgXcQ"), true);
  assert.equal(YOUTUBE_VIDEO_ID_PATTERN.test("not-a-video-id"), false);
});

test("crop math clamps within original zoom and frame geometry", () => {
  assert.equal(clampNumber(99, 1, 6), 6);
  assert.equal(clampNumber(-9, 1, 6), 1);
  assert.equal(getAvatarCoverScale({ width: 640, height: 320 }, 320), 1);
  assert.deepEqual(
    constrainAvatarCropOffset({ x: 500, y: -500 }, 2, { width: 640, height: 320 }, 320),
    { x: 480, y: -160 },
  );
  assert.equal(getPostCoverCropScale({ width: 1280, height: 720 }, { width: 320, height: 180 }), 0.25);
  assert.deepEqual(
    constrainPostCoverCropOffset(
      { x: 200, y: -100 },
      2,
      { width: 1280, height: 720 },
      { width: 320, height: 180 },
    ),
    { x: 160, y: -90 },
  );
});

test("crop geometry preserves the offset object while dimensions are unavailable", () => {
  const offset = { x: 25, y: -15 };
  assert.equal(constrainAvatarCropOffset(offset, 1, null, 320), offset);
  assert.equal(constrainPostCoverCropOffset(offset, 1, null, { width: 320, height: 180 }), offset);
});

test("media duration and file size labels preserve the original display format", () => {
  assert.equal(formatMediaDuration(-100), "0:00");
  assert.equal(formatMediaDuration(59.8), "1:00");
  assert.equal(formatMediaDuration(61), "1:01");
  assert.equal(formatFileSize(0), "1KB");
  assert.equal(formatFileSize(1_500), "1KB");
  assert.equal(formatFileSize(1_048_576), "1.0MB");
});
