import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationSql = readFileSync(
  new URL("supabase/migrations/20260817083827_add_opening_memorial_gift_notifications.sql", repositoryRoot),
  "utf8",
);
const experienceJs = readFileSync(new URL("src/openingMemorialGiftExperience.js", repositoryRoot), "utf8");
const mainJsx = readFileSync(new URL("src/main.jsx", repositoryRoot), "utf8");

test("Opening Memorial gift notification is beta/frame scoped and idempotent", () => {
  assert.match(migrationSql, /'opening_memorial_gift'::text/i);
  assert.match(migrationSql, /notifications_opening_memorial_gift_recipient_unique/i);
  assert.match(migrationSql, /where type = 'opening_memorial_gift'/i);
  assert.match(migrationSql, /frame\.frame_key = 'opening_memorial_beta'/i);
  assert.match(migrationSql, /cohort\.cohort_key = 'beta_resident'/i);
  assert.match(migrationSql, /profile\.username = 'chia_hoshizora'/i);
  assert.match(migrationSql, /on conflict do nothing/i);
});

test("future frame ownership creates the gift notification without an OS push", () => {
  assert.match(
    migrationSql,
    /create trigger profile_frame_ownerships_create_opening_memorial_gift_notification\s+after insert on public\.profile_frame_ownerships/i,
  );
  assert.match(migrationSql, /execute function app_private\.create_opening_memorial_gift_notification\(\)/i);
  assert.match(migrationSql, /if new\.type = 'opening_memorial_gift' then\s+return new;/i);
});

test("existing beta owners are backfilled exactly through the same notification type", () => {
  assert.match(migrationSql, /Backfill the gift message for beta residents who already own the frame/i);
  assert.match(migrationSql, /from public\.profile_frame_ownerships ownership/i);
  assert.match(migrationSql, /join public\.profile_cohorts cohort/i);
});

test("Village experience shows the gift once and keeps a Re:Connect frame action", () => {
  assert.match(experienceJs, /const GIFT_TYPE = "opening_memorial_gift"/);
  assert.match(experienceJs, /notification\.type !== GIFT_TYPE/);
  assert.match(experienceJs, /\.eq\("is_read", false\)/);
  assert.match(experienceJs, /\.update\(\{ is_read: true \}\)/);
  assert.match(experienceJs, /アイコンフレームが届きました！/);
  assert.match(experienceJs, /Opening Memorial/);
  assert.match(experienceJs, /この街の最初期を一緒に歩いてくれた証です/);
  assert.match(experienceJs, /data-opening-memorial-frame-button/);
  assert.match(experienceJs, /button\[aria-label="My Universe"\]/);
  assert.match(mainJsx, /import "\.\/openingMemorialGiftExperience\.js";/);
});

test("frame action waits for the real profile editor instead of assuming a 180ms render", () => {
  assert.match(experienceJs, /const FRAME_NAVIGATION_TIMEOUT_MS = 12_000/);
  assert.match(experienceJs, /new MutationObserver\(check\)/);
  assert.match(experienceJs, /button\.textContent\?\.trim\(\) === "プロフィールを編集"/);
  assert.match(experienceJs, /button\.textContent\?\.trim\(\) === "編集"/);
  assert.match(experienceJs, /!button\.disabled/);
  assert.match(experienceJs, /myUniverseButton\?\.getAttribute\("aria-current"\) !== "page"/);
  assert.match(experienceJs, /await waitForDomMatch\(\(\) => findReadyProfileEditButton\(myUniverseButton\)\)/);
  assert.match(experienceJs, /editButton\.click\(\)/);
  assert.match(experienceJs, /await waitForDomMatch\(findFrameEditorLabel\)/);
  assert.match(experienceJs, /scrollFrameEditorIntoView\(frameLabel\)/);
  assert.doesNotMatch(experienceJs, /attempt < 8/);
});
