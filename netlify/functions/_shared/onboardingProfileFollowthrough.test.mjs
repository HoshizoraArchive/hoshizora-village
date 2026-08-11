import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bridgeSource = readFileSync("src/onboardingProfileFollowthrough.js", "utf8");
const cssSource = readFileSync("src/onboardingProfileFollowthrough.css", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260803021916_allow_optional_avatar_in_initial_onboarding.sql",
  "utf8",
);

test("プロフィール入力中はちあ案内をキーボードの上へ退避する", () => {
  assert.equal(mainSource.includes('import "./onboardingProfileFollowthrough.js";'), true);
  assert.equal(mainSource.includes('import "./onboardingProfileFollowthrough.css";'), true);

  for (const token of [
    'input[placeholder="名無しの観測者"]',
    'input[placeholder="silent_creator"]',
    'textarea[placeholder^="まだ名前のない作品"]',
    'textarea[placeholder^="好きなもの"]',
    'document.addEventListener("focusin", handleFocusIn, true)',
    'document.addEventListener("focusout", handleFocusOut, true)',
    'data-profile-keyboard-open',
  ]) {
    assert.equal(bridgeSource.includes(token), true, `missing keyboard avoidance token: ${token}`);
  }

  assert.equal(
    cssSource.includes('[data-profile-keyboard-open="true"] .onboarding-guide-inner'),
    true,
  );
  assert.equal(cssSource.includes("top: max(0.55rem, env(safe-area-inset-top)) !important"), true);
  assert.equal(cssSource.includes("bottom: auto !important"), true);
});

test("プロフィール保存成功後はprofile_savedをDBへ反映して案内を再開する", () => {
  for (const token of [
    'const PROFILE_SAVE_SUCCESS_TEXT = "プロフィールを保存しました。"',
    'document.addEventListener("submit", handleSubmit, true)',
    'observer.observe(document.body, {',
    "characterData: true",
    'p_action: "profile_saved"',
    'currentProgress.current_step === "profile_success"',
    'data?.progress?.current_step === "profile_success"',
    "window.location.reload();",
  ]) {
    assert.equal(bridgeSource.includes(token), true, `missing save followthrough token: ${token}`);
  }
});

test("初回プロフィール完了は表示名を必須、星影を任意としてDB判定を同期する", () => {
  for (const token of [
    "advance_initial_onboarding",
    "pg_get_functiondef",
    "v_avatar_guard",
    "replace(v_definition, v_avatar_guard, '')",
    "Profile completion requires a saved display name; avatar remains optional.",
  ]) {
    assert.equal(migrationSource.includes(token), true, `missing optional-avatar migration token: ${token}`);
  }

  assert.equal(
    migrationSource.includes("nullif(btrim(coalesce(p.avatar_url, '')), '') is not null"),
    true,
    "migration must identify and remove the legacy avatar-required guard",
  );
});
