import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BASE64_LENGTH = 371172;
const EXPECTED_BYTES = 278378;
const EXPECTED_WIDTH = 1536;
const EXPECTED_HEIGHT = 864;
const EXPECTED_SHA256 = "73976436dd333377f6b867cc3eae35fa81478a7ea97d1d282fc8efd51d354b31";

const SOURCE_PARTS = [
  ["hoshizora-village-background-desktop.part01.b64", 62000, "69de6c58267f1f834922d66e2b07fe254d0afc19450d105760ef37d12aa950ba"],
  ["hoshizora-village-background-desktop.part02.b64", 62000, "85839c5b3dbd9ae2d4bfb675ab8b190bbd5f74c0df123933b90961a401968255"],
  ["hoshizora-village-background-desktop.part03.b64", 62000, "132b3573d1778c37b634174334bccf6f6c95fef22b8692e6e448f7adcbe54d2f"],
  ["hoshizora-village-background-desktop.part04.b64", 62000, "ebf91c34b8f73d898aa06d433eaf0565fec92e1036ef0924ce70996c8913ff96"],
  ["hoshizora-village-background-desktop.part05.b64", 62000, "d3f9b9489107d75d79b2a5d411365136ccaac3ca0e4daf623e40e9a172dafa03"],
  ["hoshizora-village-background-desktop.part06.b64", 61172, "f7ab879467e763aaffcc982bbb568f97d0d875ac35df2b08c8d8bde5083ef7dd"],
];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const imageDir = path.join(root, "public/images");
const sha256Text = (value) => createHash("sha256").update(value, "utf8").digest("hex");

test("desktop background source is the exact audited 1536x864 WebP", async () => {
  const parts = [];

  for (const [filename, expectedLength, expectedHash] of SOURCE_PARTS) {
    const content = (await readFile(path.join(imageDir, filename), "utf8")).replace(/\s+/g, "");
    assert.equal(content.length, expectedLength, `${filename} length`);
    assert.equal(sha256Text(content), expectedHash, `${filename} sha256`);
    parts.push(content);
  }

  const base64 = parts.join("");
  assert.equal(base64.length, EXPECTED_BASE64_LENGTH);
  assert.match(base64, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(base64.length % 4, 0);

  const image = Buffer.from(base64, "base64");
  assert.equal(image.toString("base64"), base64, "base64 round-trip");
  assert.equal(image.length, EXPECTED_BYTES);
  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(image.readUInt32LE(4) + 8, image.length, "RIFF declared length");
  assert.equal(image.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.deepEqual([...image.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  assert.equal(image.readUInt16LE(26) & 0x3fff, EXPECTED_WIDTH);
  assert.equal(image.readUInt16LE(28) & 0x3fff, EXPECTED_HEIGHT);
  assert.equal(createHash("sha256").update(image).digest("hex"), EXPECTED_SHA256);
});

test("desktop CSS uses the verified landscape asset without changing mobile asset", async () => {
  const css = await readFile(path.join(here, "villageBackgroundArt.css"), "utf8");
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*hoshizora-village-background-current\.webp\?v=20260803-bg75-integrity/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*hoshizora-village-background-desktop\.webp\?v=20260820-dragon-desktop-integrity/);
});

test("production build reconstructs the verified desktop asset", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(packageJson.scripts.prebuild, /extract-village-background-desktop\.mjs/);
});
