import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(new URL("../../../src/main.jsx", import.meta.url), "utf8");
const onboardingSource = await readFile(
  new URL("../../../src/InteractiveOnboarding.jsx", import.meta.url),
  "utf8",
);
const skipSource = await readFile(
  new URL("../../../src/onboardingSkipExperience.js", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL(
    "../../../supabase/migrations/20260805130000_add_onboarding_skip_all.sql",
    import.meta.url,
  ),
  "utf8",
);

test("入村案内の全体スキップ導線はReact本体から共有処理を使う", () => {
  assert.match(mainSource, /import "\.\/onboardingSkipExperience\.js";/);
  assert.match(onboardingSource, /requestSkipAllOnboarding/);
  assert.match(onboardingSource, /function OnboardingSkipAllControl/);
  assert.match(onboardingSource, /案内をすべてスキップ|ONBOARDING_SKIP_LABEL/);
});

test("全体スキップは外部DOM注入をせず、Welcomeとちあ案内カード内でReact描画する", () => {
  assert.doesNotMatch(skipSource, /MutationObserver/);
  assert.doesNotMatch(skipSource, /querySelector/);
  assert.doesNotMatch(skipSource, /\.append\(/);
  assert.match(onboardingSource, /<WelcomeVideo[\s\S]*onSkipAll=\{handleSkipAllOnboarding\}/);
  assert.match(
    onboardingSource,
    /<aside[\s\S]*className="onboarding-dialogue pointer-events-auto"[\s\S]*<OnboardingSkipAllControl/,
  );
});

test("全体スキップは確認後にDBの専用actionを呼び、成功時だけReact側で再読込する", () => {
  assert.match(skipSource, /ONBOARDING_SKIP_CONFIRM_MESSAGE/);
  assert.match(skipSource, /p_action: "skip_all"/);
  assert.match(skipSource, /advance_initial_onboarding/);
  assert.match(skipSource, /\["advanced", "already_completed"\]/);
  assert.match(onboardingSource, /result\.outcome !== "succeeded"/);
  assert.match(onboardingSource, /window\.location\.reload\(\)/);
});

test("全体スキップはsingle-flightで二重送信を防ぎ、失敗時は案内を継続できる", () => {
  assert.match(onboardingSource, /skipAllInFlightRef\.current \|\| busy/);
  assert.match(onboardingSource, /skipAllInFlightRef\.current = true/);
  assert.match(onboardingSource, /setSkipAllError\(ONBOARDING_SKIP_ERROR_MESSAGE\)/);
  assert.match(onboardingSource, /finally \{[\s\S]*skipAllInFlightRef\.current = false/);
});

test("migrationは全体スキップを完了扱いにしつつ離脱位置を保存する", () => {
  assert.match(migrationSource, /add column if not exists skipped_at timestamptz/);
  assert.match(migrationSource, /add column if not exists skipped_from_step text/);
  assert.match(migrationSource, /if p_action = 'skip_all' then/);
  assert.match(migrationSource, /current_step = 'completed'/);
  assert.match(migrationSource, /skipped_from_step = coalesce\(skipped_from_step, v_progress\.current_step\)/);
});
