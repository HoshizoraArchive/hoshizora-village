import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../../src/App.jsx", import.meta.url), "utf8");

function getAppHeaderSource() {
  const start = appSource.indexOf("function AppHeader({ auth })");
  const end = appSource.indexOf("function TabContent(", start);

  assert.notEqual(start, -1, "AppHeader should exist");
  assert.notEqual(end, -1, "TabContent should follow AppHeader");

  return appSource.slice(start, end);
}

test("未ログインヘッダーは『バズより共鳴。』だけをブランド表示する", () => {
  const appHeaderSource = getAppHeaderSource();

  assert.match(appHeaderSource, /バズより共鳴。/);
  assert.doesNotMatch(appHeaderSource, /Re:AiSNS/);
  assert.doesNotMatch(appHeaderSource, /星空Village/);
  assert.doesNotMatch(appHeaderSource, /shadow-glow/);
  assert.match(appHeaderSource, /<AuthPanel auth=\{auth\} \/>/);
});
