import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourcePath = path.join(
  projectRoot,
  "public/images/hoshizora-village-background-current.svg",
);
const outputPath = path.join(
  projectRoot,
  "public/images/hoshizora-village-background-current.webp",
);

const svg = await readFile(sourcePath, "utf8");
const match = svg.match(/data:image\/webp;base64,([^\"]+)/);

if (!match) {
  throw new Error("Embedded 星空Village WebP was not found in the SVG source.");
}

const base64 = match[1].replace(/\s+/g, "");
const imageBuffer = Buffer.from(base64, "base64");

if (!imageBuffer.length) {
  throw new Error("Embedded 星空Village WebP decoded to an empty file.");
}

await writeFile(outputPath, imageBuffer);
console.log(`Generated ${path.relative(projectRoot, outputPath)} (${imageBuffer.length} bytes)`);
