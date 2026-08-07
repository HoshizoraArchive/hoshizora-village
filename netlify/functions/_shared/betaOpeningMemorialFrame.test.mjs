import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260807102000_add_beta_opening_memorial_frame.sql",
);
const assetPath = path.join(repoRoot, "public/profile-frames/opening-memorial.png");
const migration = fs.readFileSync(migrationPath, "utf8");

function includes(fragment) {
  assert.ok(migration.includes(fragment), `migration is missing: ${fragment}`);
}

test("Opening Memorialの透過PNG素材が公開アセットとして存在する", () => {
  const png = fs.readFileSync(assetPath);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");

  const colorType = png[25];
  assert.ok(colorType === 4 || colorType === 6 || colorType === 3, "PNG must support transparency");
});

test("beta_residentだけにOpening Memorialフレーム所有権を付与する", () => {
  includes("'opening_memorial_beta'");
  includes("'/profile-frames/opening-memorial.png'");
  includes("'beta_reward'");
  includes("cohort.cohort_key = 'beta_resident'");
  includes("on conflict (profile_id, frame_id) do nothing");
});

test("既存フレーム装着中のユーザーを上書きしない", () => {
  includes("profile.active_frame_id is null");
});
