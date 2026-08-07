import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

const css = fs.readFileSync(path.join(rootDir, "src/openingMemorialFrameFit.css"), "utf8");
const main = fs.readFileSync(path.join(rootDir, "src/main.jsx"), "utf8");

test("Opening Memorial visual fit stays scoped to the beta frame asset", () => {
  assert.match(css, /opening-memorial\.png/);
  assert.doesNotMatch(css, /chia-guide\.png/);
  assert.match(css, /\.h-16\.w-16/);
  assert.match(css, /\.h-12\.w-12/);
  assert.match(css, /\.h-10\.w-10/);
  assert.match(css, /\.h-9\.w-9/);
});

test("Opening Memorial fit is loaded without changing AvatarFrame logic", () => {
  assert.match(main, /import "\.\/openingMemorialFrameFit\.css";/);
});
