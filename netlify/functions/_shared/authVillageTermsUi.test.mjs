import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../../src/App.jsx", import.meta.url), "utf8");

function getAuthPanelSource() {
  const start = appSource.indexOf("function AuthPanel({ auth })");
  const end = appSource.indexOf("function LegalDocumentModal(", start);

  assert.notEqual(start, -1, "AuthPanel should exist");
  assert.notEqual(end, -1, "LegalDocumentModal should follow AuthPanel");
  return appSource.slice(start, end);
}

test("Authタブは村用語と従来語の補助表記を併記する", () => {
  const source = getAuthPanelSource();

  assert.match(source, /aria-label="村へ帰る（ログイン）"/);
  assert.match(source, />村へ帰る<\/span>/);
  assert.match(source, /（ログイン）/);
  assert.match(source, /aria-label="入村手続き（会員登録）"/);
  assert.match(source, />入村手続き<\/span>/);
  assert.match(source, /（会員登録）/);
  assert.match(source, /text-\[9px\] font-bold text-white\/85/);
});

test("入村手続きタブはピンク系で色分けし送信操作も村用語にする", () => {
  const source = getAuthPanelSource();

  assert.match(source, /from-aurora\/20 to-sakura\/20 text-sakura/);
  assert.match(source, /isSignUp \? "入村する" : "村へ帰る"/);
});
