import { readFileSync } from "node:fs";

const expected = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const actual = process.versions.node;

if (!/^\d+\.\d+\.\d+$/.test(expected) || actual !== expected) {
  console.error(`Netlify build requires Node.js ${expected}; running ${actual}`);
  process.exit(1);
}

console.log(`Netlify build Node.js verified: v${actual}`);
