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

const sourceContents = await Promise.all(
  SOURCE_PARTS.map((filename) => readFile(path.join(imageDir, filename), "utf8")),
);
const normalizedParts = sourceContents.map((content) => content.replace(/\s+/g, ""));
const base64 = normalizedParts.join("");

function sha256OfBase64(candidate) {
  if (candidate.length !== EXPECTED_BASE64_LENGTH || candidate.length % 4 !== 0) {
    return null;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(candidate)) {
    return null;
  }
  const decoded = Buffer.from(candidate, "base64");
  if (decoded.length !== EXPECTED_BYTES) {
    return null;
  }
  return createHash("sha256").update(decoded).digest("hex");
}

if (base64.length !== EXPECTED_BASE64_LENGTH) {
  const lengths = normalizedParts.map((part, index) => `${SOURCE_PARTS[index]}=${part.length}`);
  console.error(`Background source part lengths: ${lengths.join(", ")}`);

  if (base64.length === EXPECTED_BASE64_LENGTH + 1) {
    let boundary = 0;
    for (let index = 0; index < normalizedParts.length - 1; index += 1) {
      boundary += normalizedParts[index].length;
      for (const removeAt of [boundary - 1, boundary]) {
        const candidate = base64.slice(0, removeAt) + base64.slice(removeAt + 1);
        if (sha256OfBase64(candidate) === EXPECTED_SHA256) {
          throw new Error(
            `星空Village background has one extra character at source boundary ${SOURCE_PARTS[index]} -> ${SOURCE_PARTS[index + 1]} (remove concatenated index ${removeAt}, char ${JSON.stringify(base64[removeAt])}).`,
          );
        }
      }
    }
  }

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
