import { expect, test } from "@playwright/test";

const A = "11111111-1111-4111-8111-111111111111";
const B = "77777777-7777-4777-8777-777777777777";
const memoryA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", memory_key: "song", content: "Aだけの曲名", updated_at: "2026-10-10T00:00:00Z" };
const memoryB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", memory_key: "topic", content: "Bだけの話題", updated_at: "2026-10-10T00:00:00Z" };

function session(userId, email) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: "none", typ: "JWT" })}.${encode({ aud: "authenticated", exp, sub: userId })}.fixture`,
    expires_at: exp,
    expires_in: 3600,
    refresh_token: `fixture-${userId}`,
    token_type: "bearer",
    user: { id: userId, aud: "authenticated", role: "authenticated", email, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  };
}

test("memory UI stays bound to the signed-in person and supports correction and deletion", async ({ page }) => {
  const users = { [A]: session(A, "a@example.test"), [B]: session(B, "b@example.test") };
  const fixture = { [A]: [memoryA], [B]: [memoryB] };
  let active = users[A];
  let nextLogin = users[B];

  await page.addInitScript(({ stored }) => localStorage.setItem("sb-127-auth-token", JSON.stringify(stored)), { stored: users[A] });
  await page.route("**/__supabase/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ status: active ? 200 : 401, json: active?.user ?? { message: "not authenticated" } });
    if (url.pathname.endsWith("/auth/v1/logout")) { active = null; return route.fulfill({ status: 204, body: "" }); }
    if (url.pathname.endsWith("/auth/v1/token")) {
      active = nextLogin;
      return route.fulfill({ status: 200, json: active });
    }
    if (url.pathname.endsWith("/rest/v1/chia_person_memories")) {
      const personId = (url.searchParams.get("person_profile_id") ?? "").replace(/^eq\./, "");
      const rows = fixture[personId] ?? [];
      if (req.method() === "GET") return route.fulfill({ status: 200, json: rows });
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const match = rows.find((row) => row.id === id);
      if (req.method() === "PATCH" && match) Object.assign(match, req.postDataJSON());
      if (req.method() === "DELETE" && match) fixture[personId] = rows.filter((row) => row.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/rest/v1/profiles")) {
      const userId = url.searchParams.get("id")?.replace(/^eq\./, "");
      const profile = { id: userId, display_name: userId === B ? "Bユーザー" : "Aユーザー", username: userId === B ? "fixture_b" : "fixture_a", avatar_url: null, bio: "", created_at: "2026-01-01T00:00:00Z" };
      return route.fulfill({ status: 200, json: [profile] });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await nav.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await expect(page.getByText("Aだけの曲名", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "修正", exact: true }).click();
  await page.getByLabel("記憶の内容").fill("Aが訂正した曲名");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("Aが訂正した曲名", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  await page.getByPlaceholder("you@example.com").fill("b@example.test");
  await page.getByPlaceholder("6文字以上").fill("fixture-password");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.locator('[data-auth-panel="visible"]')).toHaveCount(0);
  await nav.getByRole("button", { name: "My Universe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bユーザー", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await expect(page.getByText("Bだけの話題", { exact: true })).toBeVisible();
  await expect(page.getByText("Aが訂正した曲名", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByText("保存された記憶はありません。", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  nextLogin = users[A];
  await page.getByPlaceholder("you@example.com").fill("a@example.test");
  await page.getByPlaceholder("6文字以上").fill("fixture-password");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.locator('[data-auth-panel="visible"]')).toHaveCount(0);
  await nav.getByRole("button", { name: "My Universe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aユーザー", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await expect(page.getByText("Aが訂正した曲名", { exact: true })).toBeVisible();
  await expect(page.getByText("Bだけの話題", { exact: true })).toHaveCount(0);
});
