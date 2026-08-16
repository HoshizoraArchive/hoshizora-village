import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const migration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260816191500_add_opening_memorial_chia_gift.sql"),
  "utf8",
);
const experience = fs.readFileSync(
  path.join(repoRoot, "src/openingMemorialGiftExperience.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(repoRoot, "src/openingMemorialGiftExperience.css"),
  "utf8",
);
const main = fs.readFileSync(path.join(repoRoot, "src/main.jsx"), "utf8");

function includes(source, fragment) {
  assert.ok(source.includes(fragment), `source is missing: ${fragment}`);
}

test("Opening Memorial acquisition creates one trusted Chia gift notification", () => {
  includes(migration, "'profile_frame_gift'::text");
  includes(migration, "notifications_opening_memorial_gift_recipient_unique");
  includes(migration, "after insert on public.profile_frame_ownerships");
  includes(migration, "new.acquisition_source <> 'beta_resident'");
  includes(migration, "frame.frame_key = 'opening_memorial_beta'");
  includes(migration, "chia.username = 'chia_hoshizora'");
  includes(migration, "星空ちあからアイコンフレームが届きました！");
  includes(migration, "on conflict do nothing");
});

test("existing beta residents are backfilled without sending unsolicited OS push", () => {
  includes(migration, "new.type = 'profile_frame_gift'");
  includes(migration, "from public.profile_frame_ownerships ownership");
  includes(migration, "cohort.cohort_key = 'beta_resident'");
});

test("the gift is shown from a durable unread Re:Connect row and acknowledged once", () => {
  includes(main, 'import "./openingMemorialGiftExperience.js";');
  includes(main, 'import "./openingMemorialGiftExperience.css";');
  includes(experience, '.eq("type", OPENING_MEMORIAL_GIFT_TYPE)');
  includes(experience, '.eq("is_read", false)');
  includes(experience, '.update({ is_read: true })');
  includes(experience, "checkedUserId === userId");
  includes(experience, "Opening Memorial");
  includes(experience, "/images/onboarding/mini-chia.png");
  includes(experience, "/profile-frames/opening-memorial.png");
});

test("gift presentation has an accessible modal shell and reduced-motion support", () => {
  includes(experience, 'overlay.setAttribute("role", "dialog")');
  includes(experience, 'overlay.setAttribute("aria-modal", "true")');
  includes(styles, "prefers-reduced-motion");
});
