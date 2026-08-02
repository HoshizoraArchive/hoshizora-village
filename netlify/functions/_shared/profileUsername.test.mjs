import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  VILLAGE_USERNAME_WORDS,
  createVillageUsername,
  getProfileGuideStepDefinition,
  shouldCreateVillageUsername,
} from "../../../src/onboarding.js";

const onboardingSource = readFileSync("src/onboarding.js", "utf8");
const interactiveOnboardingSource = readFileSync("src/InteractiveOnboarding.jsx", "utf8");

test("仮ユーザー名は星空Village独自語と4文字suffixだけから生成する", () => {
  assert.deepEqual(VILLAGE_USERNAME_WORDS, ["ryuseibin", "hoshibumi", "kansoku", "kyomei"]);

  const samples = Array.from({ length: 200 }, () => createVillageUsername());
  for (const username of samples) {
    assert.match(username, /^(ryuseibin|hoshibumi|kansoku|kyomei)_[a-z0-9]{4}$/);
    assert.equal(username.length <= 32, true);
  }

  const deterministicValues = [0, 23 / 36, 33 / 36, 10 / 36, 28 / 36];
  let index = 0;
  const deterministicUsername = createVillageUsername(() => deterministicValues[index++]);
  assert.equal(deterministicUsername, "ryuseibin_x7k2");
});

test("新規プロフィールの空欄または旧仮値だけを自動生成対象にし既存usernameは保持する", () => {
  assert.equal(shouldCreateVillageUsername("", { hasExistingProfile: false }), true);
  assert.equal(shouldCreateVillageUsername("silent_creator", { hasExistingProfile: false }), true);
  assert.equal(shouldCreateVillageUsername("silent_creator", { hasExistingProfile: true }), false);
  assert.equal(shouldCreateVillageUsername("@hoshibumi_m4a8", { hasExistingProfile: false }), false);
  assert.equal(shouldCreateVillageUsername("kansoku_n2q7", { hasExistingProfile: true }), false);
});

test("表示名の次にちあが仮ユーザー名を案内し利用者がその場で変更できる", () => {
  assert.deepEqual(getProfileGuideStepDefinition("name"), {
    actionLabel: "次へ",
    lines: ["ここで、あなたの名前を教えてね！", "星空Villageでみんなに見える名前だよ✨"],
    targetKey: "name",
  });

  assert.deepEqual(getProfileGuideStepDefinition("username"), {
    actionLabel: "このままでOK！",
    lines: [
      "ユーザー名は、一時的にちあが考えたよ！",
      "独自のユーザー名にしたかったら変更してね。半角英数字と「_」で、あとからでも変えられるよ✨",
    ],
    targetKey: "username",
  });

  for (const token of [
    'moveProfileGuideTo("username")',
    'targetKey === "username"',
    'createVillageUsername()',
    'shouldCreateVillageUsername(input.value, { hasExistingProfile })',
    'PROFILE_USERNAME_PATTERN',
    'profileGuideStep === "username"',
  ]) {
    assert.equal(interactiveOnboardingSource.includes(token), true, `missing username onboarding: ${token}`);
  }
});

test("仮ユーザー名生成はメールアドレスを材料にしない", () => {
  const generatorStart = onboardingSource.indexOf("export function createVillageUsername");
  const generatorEnd = onboardingSource.indexOf("export async function tryPlayWelcomeVideo");
  const generatorSource = onboardingSource.slice(generatorStart, generatorEnd);

  assert.equal(generatorSource.includes("email"), false);
  assert.equal(generatorSource.includes("@"), true, "既存値判定の@除去は許容する");
  assert.equal(interactiveOnboardingSource.includes("session.user.email"), false);
});
