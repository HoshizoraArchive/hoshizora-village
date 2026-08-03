import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPECTED_BASE64_LENGTH = 158040;
const EXPECTED_BYTES = 118528;
const EXPECTED_WIDTH = 864;
const EXPECTED_HEIGHT = 1536;
const EXPECTED_SHA256 = "f737734ca6300ada09452be2926917d5ee8851ff7276add4d3fa439d3b8a75f7";
const LEGACY_PART03_EXTRA_INDEX = 17181;
const LEGACY_PART03_EXTRA_CHAR = "o";
const PART04_BLOCK9_START = 9000;
const PART04_BLOCK9_CANONICAL = "rpA+M8KMGlBn3758JReRcA8na6vZQIwPrtq3X/ZYCszkbQehaXEyzIyQijd9weANNX1W1C8oS+HWEffm8udFF9B0X5kokGupy8lFwnXiyU+6bBxrg9s57p5FvyWS6VZpD/Yk9qYAqc3961xieydGntcncRBT3fITtwwRg90KCHrG2iWEHwBE8brl9ZY00Mvx3c4d/22a3MndusOQroMd15cOcl3S3RgZ12Y9nXd75btEMXLJAq9Sou/i3JGoeMPliqOrF6kJuP9RL4mJ1njT+cCejx5gs7JRSEPN2ah8SxxIdrPf0XTS6LYtz88Hfo9OpFOrp0idx5a92Mx5k/KEgd03TmqilqPdh9ueTpJCtd/I5+sKgIPbzPgv0kxV4qRaneqVuBHCKahTNUPm0wcDeGytNlCpaTdqwqNzOWKKa1t+lZIjeXkvnjONC6JNTHlazc3hu9KUqfrdPJ/0MAjay7n9vu+savp3b8jf1YVnC0m5efkp7sEudluUZr5X32cCYRIVv5oOzO27kuTB8rqrSqw927GgON1kCnLr9JFSn1IhENY4fhhvhAuYvBxheVs3ZkCakoeLtVLcoHMkC9+EhE7koC5q7ojzWyvNFk8G+vYMJ5UsKXkBP09lzedKlJbd6wbkksDno7aclO3hnUsAdv6ng+l8siVJwolYuBZjDBZJGWudriIuErnqXmdlTibhVxdEwsNP3Yx8wKPQs57vcDAfb/qG8Yf+NfJ4eaAF9CDnCbIBtLnVFx1DmQZaSdrsisuMuTYh644fVgK3eQFsspCvrTkhsE1znQIGKVlpX0NUbMairuEADjTszPNOLDqM80pnsA2bXTgBCGWBoa5QAaeAXNkEXy9SBnMTlwggJ071ZW2QEpsnWzn1cfJ0IMTXKVc+2CzQABWrXsTsyvwHvMl8cai9dgXFCj6QAhEmt9NGezKx2ewACgPLx5qZxZddf/ygPakkOAVIBAb0fHMxucmzqE6nymfeQI0k+SZU";
const PART04_BLOCK9_SHA256 = "710b58220912da167149c2daaaf85a95e402310c1de63638c9cdc8fe7fc86207";

const SOURCE_PARTS = [
  ["hoshizora-village-background-current.part01.b64", 20000, "2d17a7f11832121061d4a6f47695f58e6275afe6dfed140c01c9d1af8e7ee5ec"],
  ["hoshizora-village-background-current.part02.b64", 20000, "4ff3c03b7b8858ba43d1a222f081fa2d611deaac609f609fcfa3143a43151c8b"],
  ["hoshizora-village-background-current.part03.b64", 20000, "10a9c00f59aa84b4520fc8a5c9d8be8021bfa5dffdb12110775bc162848b52fb"],
  ["hoshizora-village-background-current.part04.b64", 20000, "518f64d117b93bfa16eebe88b8ddcc036e7d48b8eadcf6ca0c11dc85dbcacaf6"],
  ["hoshizora-village-background-current.part05.b64", 20000, "021d1450f06d1e0cb3c8a3580c903cfc50610566b90b1911b8c27b45ac8d5fd3"],
  ["hoshizora-village-background-current.part06.b64", 20000, "98c1a905f65daf5b606bbb842cbc3816a7b5f1e3c12e2c15613928ecd4f88d17"],
  ["hoshizora-village-background-current.part07a.b64", 4000, "94f3a178a4bfb09a352226330b6a51b3c4c12f3a15d2b7937986309a4f9b0a31"],
  ["hoshizora-village-background-current.part07b.b64", 4000, "6e1625203961fe742ebcb7e5637bcab2acedc464c37846adbd5cd3d452514876"],
  ["hoshizora-village-background-current.part07c.b64", 4000, "aed60ed0205c17aecd1d123546b04a1d2da968f1ee95b75767c677aa54ac656a"],
  ["hoshizora-village-background-current.part07d.b64", 4000, "df6a4ff99054df5bff1f4488d1e08ca31ded1d53d07d1a1b0493c97cb0c5334f"],
  ["hoshizora-village-background-current.part07e.b64", 4000, "e1594522ff6ac4ff8c8199aaaa22357cd62ce32eb41e82fe4e4f20da6f375465"],
  ["hoshizora-village-background-current.part08a.b64", 4000, "24a74deebe27fa134e48f5f2c16765ac4d14f870feef44e390f2cec35fce6a53"],
  ["hoshizora-village-background-current.part08b.b64", 4000, "d0dea51fa11fe0c0813a274aabdc9d7284ab2b3d155c1b48f51d349354f763f7"],
  ["hoshizora-village-background-current.part08c.b64", 4000, "ed7230f51a369870f02be4cc275833d62001a13a61865aece4a9fc6cbee873ac"],
  ["hoshizora-village-background-current.part08d.b64", 4000, "be5fd8938bedaf953d9c0ba18774b7a58187c07298a1a43606955e7157f830f1"],
  ["hoshizora-village-background-current.part08e.b64", 2040, "fad35908c18f3273608696f446dfb59ed7cba9864c0a2240ba6bf1350ec339e3"],
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const imageDir = path.join(projectRoot, "public/images");
const outputPath = path.join(imageDir, "hoshizora-village-background-current.webp");
const sha256Text = (value) => createHash("sha256").update(value, "utf8").digest("hex");

if (PART04_BLOCK9_CANONICAL.length !== 1000 || sha256Text(PART04_BLOCK9_CANONICAL) !== PART04_BLOCK9_SHA256) {
  throw new Error("Embedded canonical 星空Village part04 block is not byte-exact.");
}

const sourceContents = await Promise.all(SOURCE_PARTS.map(([filename]) => readFile(path.join(imageDir, filename), "utf8")));
const normalizedParts = sourceContents.map((content) => content.replace(/\s+/g, ""));

const rawPart03 = normalizedParts[2];
if (rawPart03.length === 20001) {
  if (rawPart03[LEGACY_PART03_EXTRA_INDEX] !== LEGACY_PART03_EXTRA_CHAR) throw new Error("星空Village background part03 legacy defect no longer matches the audited source.");
  normalizedParts[2] = rawPart03.slice(0, LEGACY_PART03_EXTRA_INDEX) + rawPart03.slice(LEGACY_PART03_EXTRA_INDEX + 1);
}

// The audit proved all part04 1,000-char blocks except block 9 are canonical.
// Replace only that known-corrupted transfer block with the canonical slice.
const rawPart04 = normalizedParts[3];
if (rawPart04.length !== 20000) throw new Error("星空Village background part04 length changed unexpectedly.");
normalizedParts[3] = rawPart04.slice(0, PART04_BLOCK9_START) + PART04_BLOCK9_CANONICAL + rawPart04.slice(PART04_BLOCK9_START + 1000);

const mismatches = [];
for (let index = 0; index < SOURCE_PARTS.length; index += 1) {
  const [filename, expectedLength, expectedHash] = SOURCE_PARTS[index];
  const actual = normalizedParts[index];
  const actualHash = sha256Text(actual);
  if (actual.length !== expectedLength || actualHash !== expectedHash) mismatches.push(`${filename}: len=${actual.length}/${expectedLength}, sha256=${actualHash}/${expectedHash}`);
}
if (mismatches.length) throw new Error(`星空Village canonical source chunk mismatch:\n${mismatches.join("\n")}`);

const base64 = normalizedParts.join("");
if (base64.length !== EXPECTED_BASE64_LENGTH) throw new Error(`星空Village background base64 length mismatch: expected ${EXPECTED_BASE64_LENGTH}, got ${base64.length}.`);
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new Error("星空Village background source is not valid canonical base64.");
const imageBuffer = Buffer.from(base64, "base64");
if (imageBuffer.toString("base64") !== base64) throw new Error("星空Village background base64 did not round-trip exactly.");
if (imageBuffer.length !== EXPECTED_BYTES) throw new Error(`星空Village background byte length mismatch: expected ${EXPECTED_BYTES}, got ${imageBuffer.length}.`);
if (imageBuffer.subarray(0, 4).toString("ascii") !== "RIFF") throw new Error("星空Village background is missing the RIFF signature.");
if (imageBuffer.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("星空Village background is missing the WEBP signature.");
const declaredBytes = imageBuffer.readUInt32LE(4) + 8;
if (declaredBytes !== imageBuffer.length) throw new Error(`星空Village background RIFF length mismatch: header declares ${declaredBytes}, actual ${imageBuffer.length}.`);
if (imageBuffer.subarray(12, 16).toString("ascii") !== "VP8 ") throw new Error("星空Village background is not the expected VP8 WebP variant.");
if (imageBuffer[23] !== 0x9d || imageBuffer[24] !== 0x01 || imageBuffer[25] !== 0x2a) throw new Error("星空Village background VP8 frame header is invalid.");
const width = imageBuffer.readUInt16LE(26) & 0x3fff;
const height = imageBuffer.readUInt16LE(28) & 0x3fff;
if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) throw new Error(`星空Village background dimensions mismatch: expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}, got ${width}x${height}.`);
const sha256 = createHash("sha256").update(imageBuffer).digest("hex");
if (sha256 !== EXPECTED_SHA256) throw new Error(`星空Village background SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}.`);
await writeFile(outputPath, imageBuffer);
console.log(`Generated ${path.relative(projectRoot, outputPath)} (${imageBuffer.length} bytes, ${width}x${height}, sha256=${sha256})`);
