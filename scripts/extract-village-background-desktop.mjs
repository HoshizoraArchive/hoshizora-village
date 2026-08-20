import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const imageDir = path.join(projectRoot, "public/images");
const outputPath = path.join(imageDir, "hoshizora-village-background-desktop.webp");
const sha256Text = (value) => createHash("sha256").update(value, "utf8").digest("hex");

const sourceContents = await Promise.all(
  SOURCE_PARTS.map(([filename]) => readFile(path.join(imageDir, filename), "utf8")),
);
const normalizedParts = sourceContents.map((content) => content.replace(/\s+/g, ""));

const mismatches = [];
for (let index = 0; index < SOURCE_PARTS.length; index += 1) {
  const [filename, expectedLength, expectedHash] = SOURCE_PARTS[index];
  const actual = normalizedParts[index];
  const actualHash = sha256Text(actual);
  if (actual.length !== expectedLength || actualHash !== expectedHash) {
    mismatches.push(
      `${filename}: len=${actual.length}/${expectedLength}, sha256=${actualHash}/${expectedHash}`,
    );
  }
}
if (mismatches.length) {
  throw new Error(`星空Village desktop canonical source chunk mismatch:\n${mismatches.join("\n")}`);
}

const base64 = normalizedParts.join("");
if (base64.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(
    `星空Village desktop background base64 length mismatch: expected ${EXPECTED_BASE64_LENGTH}, got ${base64.length}.`,
  );
}
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
  throw new Error("星空Village desktop background source is not valid canonical base64.");
}

const imageBuffer = Buffer.from(base64, "base64");
if (imageBuffer.toString("base64") !== base64) {
  throw new Error("星空Village desktop background base64 did not round-trip exactly.");
}
if (imageBuffer.length !== EXPECTED_BYTES) {
  throw new Error(
    `星空Village desktop background byte length mismatch: expected ${EXPECTED_BYTES}, got ${imageBuffer.length}.`,
  );
}
if (imageBuffer.subarray(0, 4).toString("ascii") !== "RIFF") {
  throw new Error("星空Village desktop background is missing the RIFF signature.");
}
if (imageBuffer.subarray(8, 12).toString("ascii") !== "WEBP") {
  throw new Error("星空Village desktop background is missing the WEBP signature.");
}

const declaredBytes = imageBuffer.readUInt32LE(4) + 8;
if (declaredBytes !== imageBuffer.length) {
  throw new Error(
    `星空Village desktop background RIFF length mismatch: header declares ${declaredBytes}, actual ${imageBuffer.length}.`,
  );
}
if (imageBuffer.subarray(12, 16).toString("ascii") !== "VP8 ") {
  throw new Error("星空Village desktop background is not the expected VP8 WebP variant.");
}
if (imageBuffer[23] !== 0x9d || imageBuffer[24] !== 0x01 || imageBuffer[25] !== 0x2a) {
  throw new Error("星空Village desktop background VP8 frame header is invalid.");
}

const width = imageBuffer.readUInt16LE(26) & 0x3fff;
const height = imageBuffer.readUInt16LE(28) & 0x3fff;
if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
  throw new Error(
    `星空Village desktop background dimensions mismatch: expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}, got ${width}x${height}.`,
  );
}

const sha256 = createHash("sha256").update(imageBuffer).digest("hex");
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(
    `星空Village desktop background SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}.`,
  );
}

await writeFile(outputPath, imageBuffer);
console.log(
  `Generated ${path.relative(projectRoot, outputPath)} (${imageBuffer.length} bytes, ${width}x${height}, sha256=${sha256})`,
);
