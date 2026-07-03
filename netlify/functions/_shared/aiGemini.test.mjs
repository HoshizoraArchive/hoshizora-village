import assert from "node:assert/strict";
import test from "node:test";
import { bufferMatchesMimeType } from "./aiGemini.mjs";

test("Gemini media validation checks basic image signatures", () => {
  assert.equal(bufferMatchesMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), "image/jpeg"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]), "image/png"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("RIFFxxxxWEBP", "ascii"), "image/webp"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("not-an-image!"), "image/png"), false);
});

test("Gemini media validation checks basic video signatures", () => {
  assert.equal(bufferMatchesMimeType(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]), "video/mp4"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]), "video/quicktime"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), "video/webm"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("not-a-video!"), "video/mp4"), false);
});
