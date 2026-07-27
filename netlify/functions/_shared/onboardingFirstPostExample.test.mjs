import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/onboardingFirstPostExample.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("初回流星便だけに名前入り例文と入力ボタンを表示する", () => {
  for (const token of [
    'form[data-onboarding-target="post-composer"]',
    "はじめまして！${safeName}です！よろしくお願いします！",
    "はじめての流星便に使える例文",
    "この例文を使う",
    'textarea.dispatchEvent(new Event("input", { bubbles: true }))',
    "textarea.placeholder = exampleText",
    "removeFirstPostExample()",
  ]) {
    assert.equal(source.includes(token), true, `missing first post example behavior: ${token}`);
  }

  assert.equal(mainSource.includes('import "./onboardingFirstPostExample.js";'), true);
});

test("通常投稿へ戻った時は従来の問いかけへ戻す", () => {
  assert.equal(source.includes('const DEFAULT_COMPOSER_PLACEHOLDER = "今夜、どの星を観測してほしい？";'), true);
  assert.equal(source.includes("activeTextarea.placeholder = DEFAULT_COMPOSER_PLACEHOLDER"), true);
});
