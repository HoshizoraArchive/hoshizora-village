import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPECTED_BASE64_LENGTH = 158040;
const EXPECTED_BYTES = 118528;
const EXPECTED_WIDTH = 864;
const EXPECTED_HEIGHT = 1536;
const EXPECTED_SHA256 =
  "f737734ca6300ada09452be2926917d5ee8851ff7276add4d3fa439d3b8a75f7";
const EXPECTED_PART03_SHA256 =
  "10a9c00f59aa84b4520fc8a5c9d8be8021bfa5dffdb12110775bc162848b52fb";
const LEGACY_PART03_EXTRA_INDEX = 17181;
const LEGACY_PART03_EXTRA_CHAR = "o";

const SOURCE_PARTS = [
  "hoshizora-village-background-current.part01.b64",
  "hoshizora-village-background-current.part02.b64",
  "hoshizora-village-background-current.part03.b64",
  "hoshizora-village-background-current.part04.b64",
  "hoshizora-village-background-current.part05.b64",
  "hoshizora-village-background-current.part06.b64",
  "hoshizora-village-background-current.part07a.b64",
  "hoshizora-village-background-current.part07b.b64",
  "hoshizora-village-background-current.part07c.b64",
  "hoshizora-village-background-current.part07d.b64",
  "hoshizora-village-background-current.part07e.b64",
  "hoshizora-village-background-current.part08a.b64",
  "hoshizora-village-background-current.part08b.b64",
  "hoshizora-village-background-current.part08c.b64",
  "hoshizora-village-background-current.part08d.b64",
  "hoshizora-village-background-current.part08e.b64",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const imageDir = path.join(projectRoot, "public/images");
const outputPath = path.join(
  imageDir,
  "hoshizora-village-background-current.webp",
);

const sha256Text = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const sourceContents = await Promise.all(
  SOURCE_PARTS.map((filename) => readFile(path.join(imageDir, filename), "utf8")),
);
const normalizedParts = sourceContents.map((content) => content.replace(/\s+/g, ""));

// The original text transfer introduced exactly one verified extra character in
// part03. Repair only that known defect, and only when the repaired part hashes
// to the canonical 20,000-character slice from bg-75.webp. Any other drift is
// a hard build failure.
const rawPart03 = normalizedParts[2];
if (rawPart03.length === 20001) {
  if (rawPart03[LEGACY_PART03_EXTRA_INDEX] !== LEGACY_PART03_EXTRA_CHAR) {
    throw new Error("星空Village background part03 legacy defect no longer matches the audited source.");
  }
  const repairedPart03 =
    rawPart03.slice(0, LEGACY_PART03_EXTRA_INDEX) +
    rawPart03.slice(LEGACY_PART03_EXTRA_INDEX + 1);
  if (sha256Text(repairedPart03) !== EXPECTED_PART03_SHA256) {
    throw new Error("星空Village background part03 repair did not match the canonical source hash.");
  }
  normalizedParts[2] = repairedPart03;
} else if (
  rawPart03.length !== 20000 ||
  sha256Text(rawPart03) !== EXPECTED_PART03_SHA256
) {
  throw new Error("星空Village background part03 does not match the canonical source.");
}

const base64 = normalizedParts.join("");

if (base64.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(
    `星空Village background base64 length mismatch: expected ${EXPECTED_BASE64_LENGTH}, got ${base64.length}.`,
  );
}

if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
  throw new Error("星空Village background source is not valid canonical base64.");
}

const imageBuffer = Buffer.from(base64, "base64");

if (imageBuffer.toString("base64") !== base64) {
  throw new Error("星空Village background base64 did not round-trip exactly.");
}

if (imageBuffer.length !== EXPECTED_BYTES) {
  throw new Error(
    `星空Village background byte length mismatch: expected ${EXPECTED_BYTES}, got ${imageBuffer.length}.`,
  );
}

if (imageBuffer.subarray(0, 4).toString("ascii") !== "RIFF") {
  throw new Error("星空Village background is missing the RIFF signature.");
}

if (imageBuffer.subarray(8, 12).toString("ascii") !== "WEBP") {
  throw new Error("星空Village background is missing the WEBP signature.");
}

const declaredBytes = imageBuffer.readUInt32LE(4) + 8;
if (declaredBytes !== imageBuffer.length) {
  throw new Error(
    `星空Village background RIFF length mismatch: header declares ${declaredBytes}, actual ${imageBuffer.length}.`,
  );
}

if (imageBuffer.subarray(12, 16).toString("ascii") !== "VP8 ") {
  throw new Error("星空Village background is not the expected VP8 WebP variant.");
}

if (
  imageBuffer[23] !== 0x9d ||
  imageBuffer[24] !== 0x01 ||
  imageBuffer[25] !== 0x2a
) {
  throw new Error("星空Village background VP8 frame header is invalid.");
}

const width = imageBuffer.readUInt16LE(26) & 0x3fff;
const height = imageBuffer.readUInt16LE(28) & 0x3fff;
if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
  throw new Error(
    `星空Village background dimensions mismatch: expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}, got ${width}x${height}.`,
  );
}

const sha256 = createHash("sha256").update(imageBuffer).digest("hex");
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(
    `星空Village background SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}.`,
  );
}

await writeFile(outputPath, imageBuffer);
console.log(
  `Generated ${path.relative(projectRoot, outputPath)} (${imageBuffer.length} bytes, ${width}x${height}, sha256=${sha256})`,
);
