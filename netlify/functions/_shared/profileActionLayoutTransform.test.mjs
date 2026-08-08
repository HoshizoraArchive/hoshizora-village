import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyProfileActionLayout } from "../../../scripts/profile-action-layout-transform.mjs";

const appSource = readFileSync("src/App.jsx", "utf8");

test("My Universe profile actions are transformed without changing their existing handlers", () => {
  const transformed = applyProfileActionLayout(appSource);

  assert.match(transformed, /mt-4 grid grid-cols-2 gap-3/);
  assert.match(transformed, />\s*プロフィールを共有\s*<\/button>/);
  assert.match(transformed, /profile\.loading \? "読込中" : "プロフィールを編集"/);
  assert.match(transformed, /onClick=\{\(\) => profile\.onShareProfile\(profile\.data\?\.username\)\}/);
  assert.match(transformed, /onClick=\{profile\.onStartEdit\}/);
  assert.match(
    transformed,
    /data-onboarding-target=\{profile\.onboardingTarget === "profile-edit" \? "profile-edit" : undefined\}/,
  );
  assert.match(transformed, /onClick=\{profile\.onOpenSettings\}/);
  assert.doesNotMatch(transformed, /星座URLを共有/);
  assert.doesNotMatch(transformed, /profile\.loading \? "読込中" : "編集"/);
});

test("profile action transform refuses to run if the expected source shape changes", () => {
  assert.throws(
    () => applyProfileActionLayout(appSource.replace("星座URLを共有", "別の文言")),
    /Profile action layout source changed unexpectedly/,
  );
});
