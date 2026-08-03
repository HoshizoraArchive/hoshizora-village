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
const EXPECTED_PART04_BLOCK_SHA256 = [
  "3c7dd81d2a1f717c2916cb7641c28d7eddf666a147ae084c37e07a7daf10f4c9",
  "79578f9e5aa0a97853cc2a49b3502ee7c6d5ec055a465c5f32cadc72e9ecd023",
  "44016f2c1e53eadc575275b52f299bdec0e355fbf5ba2c08cfff8cfd811e78ac",
  "79118914dcf341fb1a7d806f8534981737d1a587e2343ba28007450a1cf02d7c",
  "2a7fdd6ce3a956a77c60ae2c2fa067f0dbf788f07a70738347e5f539d318a4a7",
  "f2e8770c4821b35c98930d4ac9be1aae6807ba7b50ba9c13530f5ba3b3fdc3ca",
  "c1e09e17d01c569c79eca35aab12db6a9634b69982faef3ad7cd9a22f01e28fd",
  "fb43a8669b7bed63bffe514889624c12a61a765441c56500de21539edc8982d9",
  "76e1627bbd3357c83f611cf2e2acc016ed93c0b2f8879506b176b3e352c7b305",
  "710b58220912da167149c2daaaf85a95e402310c1de63638c9cdc8fe7fc86207",
  "84be50c502124e498eb0de060854c0de90155749d759db08b1b20c78148afb04",
  "5be834b45cd548654aa6d4bc20d09d76dde7ba0763d6a75fb3afd53a9c58066d",
  "53b672195ec9dd1e271254c6bf6b4d3c61bbe87ba1d04794e9837e90a7c38a21",
  "2928de0eee584e35185ac402bdd24751e1ca5c7ee1472548ae5cc29f79276053",
  "84990fc9437518c245929dbde08ec77b12a6e9d5357fa0e4055cc8cd059f6ff5",
  "9a686744f71eb15e435791179221b8cf50a4f5671418db538599871e50ee987a",
  "7169284a2e6489ef2aa12cfa4c89b765ca5c0e2525b14e5f61ee9dc420ec08c9",
  "ad6dc7838903d8d8e903d14a52289e5a1f650c28767ba67fdeaaf76cf7a46163",
  "e8df07586ba8b87e65b7f00b6678d02e16f44e783abb57ceea3bc568b1bfc24f",
  "e963d9c8102cbf59a2891ab13b44bbfbb7d21d32c53e0af049d4e80e3d4d222c",
];
const EXPECTED_PART04_BLOCK9_SUB_SHA256 = [
  "862fdc10b121ad28b0ee2d2933c980a92f9efb228949b8239743313efaa1e4d9",
  "472c0ab9214cb01abbae16940776a98a41b496d84a2f57370f8d9ff876abda59",
  "171e0a99a9887bad1141d2de932e6c9da96d2ed204067ca938ac47b7a023a6d5",
  "80188f9eb6fe54af4f45a40717274c41aa8af5598eb2d6c4d982cc9028ca86d4",
  "bf87148f464bd2d4bd1f52d50489f1112ba278d27683b86435e49d7a9e8f11cf",
  "cda52ad20cb5ea5cda91c301641118f63d3680c12bb0a15f2611120da104fbb9",
  "a79bf3e4d8b3541a9ee3e4019679a42f0d6b4f3568f9d05be55d00520f426ad8",
  "1f30958504490cc81cb075da4ffb8ff587e5fdd52d8ea6f86472e3b7784bcfe3",
  "95f818703a019e548c9ea2d52682371f24d606b09bd771580a24bf4cea838134",
  "e94969b610c50103d4e8bbb3121fdce354e8a708bd92ab11d15b4cd046511816",
];

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

const sourceContents = await Promise.all(SOURCE_PARTS.map(([filename]) => readFile(path.join(imageDir, filename), "utf8")));
const normalizedParts = sourceContents.map((content) => content.replace(/\s+/g, ""));

const rawPart03 = normalizedParts[2];
if (rawPart03.length === 20001) {
  if (rawPart03[LEGACY_PART03_EXTRA_INDEX] !== LEGACY_PART03_EXTRA_CHAR) throw new Error("星空Village background part03 legacy defect no longer matches the audited source.");
  normalizedParts[2] = rawPart03.slice(0, LEGACY_PART03_EXTRA_INDEX) + rawPart03.slice(LEGACY_PART03_EXTRA_INDEX + 1);
}

const mismatches = [];
for (let index = 0; index < SOURCE_PARTS.length; index += 1) {
  const [filename, expectedLength, expectedHash] = SOURCE_PARTS[index];
  const actual = normalizedParts[index];
  const actualHash = sha256Text(actual);
  if (actual.length !== expectedLength || actualHash !== expectedHash) {
    mismatches.push(`${filename}: len=${actual.length}/${expectedLength}, sha256=${actualHash}/${expectedHash}`);
    if (index === 3 && actual.length === 20000) {
      const badBlocks = [];
      for (let block = 0; block < 20; block += 1) {
        const blockValue = actual.slice(block * 1000, (block + 1) * 1000);
        const blockHash = sha256Text(blockValue);
        if (blockHash !== EXPECTED_PART04_BLOCK_SHA256[block]) {
          badBlocks.push(`${block}: ${blockHash}/${EXPECTED_PART04_BLOCK_SHA256[block]}`);
          if (block === 9) {
            const badSubBlocks = [];
            for (let sub = 0; sub < 10; sub += 1) {
              const subValue = blockValue.slice(sub * 100, (sub + 1) * 100);
              const subHash = sha256Text(subValue);
              if (subHash !== EXPECTED_PART04_BLOCK9_SUB_SHA256[sub]) {
                badSubBlocks.push(`${sub}: ${subHash}/${EXPECTED_PART04_BLOCK9_SUB_SHA256[sub]}`);
              }
            }
            badBlocks.push(`block9 mismatching 100-char subblocks: ${badSubBlocks.join(", ")}`);
          }
        }
      }
      mismatches.push(`part04 mismatching 1000-char blocks: ${badBlocks.join(" | ")}`);
    }
  }
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
