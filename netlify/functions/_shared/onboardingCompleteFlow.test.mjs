import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboardingSource = await readFile(new URL("../../../src/onboarding.js", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../../../supabase/schema.sql", import.meta.url), "utf8");

const EXPECTED_UI_STEPS = [
  "mini_chia_intro",
  "profile_setup",
  "profile_success",
  "observe_intro",
  "archive_prompt",
  "archive_check",
  "archive_success",
  "rconnect_intro",
  "notification_permission",
  "device_registration",
  "push_test",
  "push_test_success",
  "push_test_explained",
  "post_intro_1",
  "post_intro_2",
  "post_intro_3",
  "post_intro_4",
  "first_post",
  "completion_1",
  "completion_2",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertActionTransition(action, fromStep, toStep) {
  const expression = new RegExp(
    `p_action = '${escapeRegex(action)}'[\\s\\S]{0,1800}current_step = '${escapeRegex(toStep)}'`,
  );
  const fromExpression = new RegExp(
    `p_action = '${escapeRegex(action)}'[\\s\\S]{0,300}current_step(?:\\s+in\\s+\\([^)]*|\\s*=)\\s*['(, ]*${escapeRegex(fromStep)}`,
  );

  assert.match(schemaSource, fromExpression, `${action} must be gated by ${fromStep}`);
  assert.match(schemaSource, expression, `${action} must advance to ${toStep}`);
}

test("通常の入村案内はWelcomeから完了までDB状態遷移が一本につながっている", () => {
  assertActionTransition("welcome_completed", "welcome_video", "mini_chia_intro");
  assertActionTransition("mini_chia_ack", "mini_chia_intro", "profile_setup");
  assertActionTransition("profile_saved", "profile_setup", "profile_success");
  assertActionTransition("profile_success_ack", "profile_success", "observe_intro");
  assertActionTransition("observe_intro_ack", "observe_intro", "archive_prompt");
  assertActionTransition("archive_saved", "archive_prompt", "archive_check");
  assertActionTransition("archive_confirmed", "archive_check", "archive_success");
  assertActionTransition("archive_success_ack", "archive_success", "rconnect_intro");
  assertActionTransition("rconnect_intro_ack", "rconnect_intro", "notification_permission");

  assert.match(
    schemaSource,
    /p_action = 'notification_permission'[\s\S]{0,2200}case when p_status = 'granted' then 'device_registration'/,
  );
  assertActionTransition("push_registered", "device_registration", "push_test");

  assert.match(
    schemaSource,
    /current_step = 'push_test_success'[\s\S]{0,1200}push_test_status = 'succeeded'/,
    "successful real Push must advance onboarding to push_test_success",
  );
  assertActionTransition("push_test_success_ack", "push_test_success", "push_test_explained");
  assertActionTransition("push_test_explained_ack", "push_test_explained", "post_intro_1");
  assertActionTransition("post_intro_1_ack", "post_intro_1", "post_intro_2");
  assertActionTransition("post_intro_2_ack", "post_intro_2", "post_intro_3");
  assertActionTransition("post_intro_3_ack", "post_intro_3", "post_intro_4");
  assertActionTransition("post_intro_4_ack", "post_intro_4", "first_post");
  assertActionTransition("first_post_saved", "first_post", "completion_1");
  assertActionTransition("completion_1_ack", "completion_1", "completion_2");
  assertActionTransition("complete", "completion_2", "completed");
});

test("通知が使えない経路も途中停止せず流星便案内へ合流する", () => {
  assert.match(
    schemaSource,
    /p_action = 'skip_notifications'[\s\S]{0,450}current_step in \('notification_permission', 'device_registration', 'push_test'\)/,
  );
  assert.match(
    schemaSource,
    /p_action = 'skip_notifications'[\s\S]{0,1800}current_step = 'post_intro_1'/,
  );
});

test("Reactが参照する通常オンボーディング全ステップをUI定義が欠落なく持つ", () => {
  const definitionsBlock = onboardingSource.match(
    /const STEP_DEFINITIONS = \{([\s\S]*?)\n\};\n\nconst PROFILE_GUIDE_STEP_DEFINITIONS/,
  )?.[1];

  assert.ok(definitionsBlock, "STEP_DEFINITIONS block must exist");
  const actualSteps = [...definitionsBlock.matchAll(/^  ([a-z0-9_]+): \{/gm)].map((match) => match[1]);

  assert.deepEqual(actualSteps, EXPECTED_UI_STEPS);
});

test("各画面グループの再開先が定義され、途中再読込でも案内を復元できる", () => {
  for (const step of ["profile_setup", "profile_success"]) {
    assert.match(onboardingSource, new RegExp(`\\["profile_setup", "profile_success"\\]\\.includes\\(step\\)`));
    assert.match(onboardingSource, /return "profile";/);
  }

  for (const step of ["observe_intro", "archive_prompt", "archive_check", "archive_success"]) {
    assert.ok(onboardingSource.includes(`"${step}"`), `${step} must be covered by onboarding resume logic`);
  }

  for (const step of [
    "rconnect_intro",
    "notification_permission",
    "device_registration",
    "push_test",
    "push_test_success",
    "push_test_explained",
  ]) {
    assert.ok(onboardingSource.includes(`"${step}"`), `${step} must remain in R.Connect resume coverage`);
  }

  for (const step of ["post_intro_1", "post_intro_2", "post_intro_3", "post_intro_4", "first_post"]) {
    assert.ok(onboardingSource.includes(`"${step}"`), `${step} must remain in post resume coverage`);
  }

  assert.match(onboardingSource, /return "rconnect";/);
  assert.match(onboardingSource, /return "post";/);
});
