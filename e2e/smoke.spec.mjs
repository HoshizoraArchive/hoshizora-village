import { expect, test } from "@playwright/test";

async function mockSupabaseAsEmptyVillage(page) {
  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "content-range": "0-0/0",
      },
      body: "[]",
    });
  });
}

async function openVillageAsGuest(page) {
  await mockSupabaseAsEmptyVillage(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "星空Village" })).toBeVisible();
}

async function fulfillAuthJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  });
}

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

test.describe("星空Village browser smoke", () => {
  test("ゲスト状態でアプリとログインUIが起動する", async ({ page }) => {
    await openVillageAsGuest(page);

    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: "ログインする" })).toBeVisible();

    const navigation = page.getByRole("navigation", {
      name: "星空Village bottom navigation",
    });

    await expect(navigation).toBeVisible();

    for (const label of ["観測", "R.Connect", "流星便", "Archive", "My Universe"]) {
      await expect(navigation.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    await expect(
      navigation.getByRole("button", { name: "観測", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("主要5タブをスマホ幅で移動できる", async ({ page }) => {
    await openVillageAsGuest(page);

    const navigation = page.getByRole("navigation", {
      name: "星空Village bottom navigation",
    });

    for (const label of ["R.Connect", "Archive", "My Universe", "観測"]) {
      const button = navigation.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-current", "page");
    }

    await navigation.getByRole("button", { name: "流星便", exact: true }).click();
    await expect(page.getByRole("heading", { name: "流星便を作成" })).toBeVisible();
    await expect(page.getByText("ログインすると流星便を放流できます。", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "← 戻る", exact: true }).click();
    await expect(navigation).toBeVisible();
    await expect(
      navigation.getByRole("button", { name: "観測", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("会員登録成功後は再登録できない確認待ち画面へ進む", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let signupRequests = 0;

    await page.route("**/__supabase/auth/v1/signup", async (route) => {
      signupRequests += 1;
      await fulfillAuthJson(route, {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "new-villager@example.com",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "会員登録", exact: true }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("new-villager@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("safe-password");
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
    await page.getByLabel("私は18歳以上であることを確認します").check();
    await page.getByRole("button", { name: "会員登録する" }).click();

    await expect(page.getByRole("heading", { name: "会員登録できました！" })).toBeVisible();
    await expect(page.getByText("new-villager@example.com 宛に確認メールを送りました。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "会員登録する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /秒後に再送できます/ })).toBeDisabled();
    expect(signupRequests).toBe(1);
  });

  test("期限切れ確認リンクはsignupを再実行せず確認メールを再送できる", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let signupRequests = 0;
    let resendRequests = 0;

    await page.route("**/__supabase/auth/v1/signup", async (route) => {
      signupRequests += 1;
      await fulfillAuthJson(route, {});
    });
    await page.route("**/__supabase/auth/v1/resend", async (route) => {
      resendRequests += 1;
      const body = route.request().postDataJSON();
      expect(body.type).toBe("signup");
      expect(body.email).toBe("returning-villager@example.com");
      await fulfillAuthJson(route, {});
    });

    await page.goto("/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await expect(
      page.getByRole("heading", { name: "この確認リンクは古いか、期限切れになっています。" }),
    ).toBeVisible();
    await page.getByLabel("再送先メールアドレス").fill("returning-villager@example.com");
    await page.getByRole("button", { name: "確認メールを再送する" }).click();

    await expect(page.getByText("確認メールを再送しました。", { exact: true })).toBeVisible();
    expect(signupRequests).toBe(0);
    expect(resendRequests).toBe(1);
  });

  test("未確認メールでのログインは専用復旧UIへ進む", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);

    await page.route("**/__supabase/auth/v1/token?grant_type=password", async (route) => {
      await fulfillAuthJson(
        route,
        {
          error_code: "email_not_confirmed",
          msg: "Email not confirmed",
        },
        400,
      );
    });

    await page.goto("/");
    await page.getByLabel("メールアドレス", { exact: true }).fill("pending@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("safe-password");
    await page.getByRole("button", { name: "ログインする" }).click();

    await expect(
      page.getByRole("heading", { name: "メールアドレスの確認がまだ完了していません。" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "確認メールを再送する" })).toBeEnabled();
  });

  test("通常ログインは従来どおりセッションと同意記録を確定する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    const userId = "22222222-2222-4222-8222-222222222222";
    const accessToken = createUnsignedTestJwt({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3_600,
      sub: userId,
    });

    await page.route("**/__supabase/auth/v1/token?grant_type=password", async (route) => {
      await fulfillAuthJson(route, {
        access_token: accessToken,
        expires_in: 3_600,
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "confirmed@example.com",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {
            legal_age_confirmed: true,
            legal_privacy_version: "2026-07-10",
            legal_terms_version: "2026-07-10",
          },
          created_at: "2026-08-02T00:00:00.000Z",
          updated_at: "2026-08-02T00:00:00.000Z",
        },
      });
    });
    await page.route("**/__supabase/rest/v1/rpc/record_legal_consent", async (route) => {
      await fulfillAuthJson(route, { outcome: "recorded" });
    });

    await page.goto("/");
    await page.getByLabel("メールアドレス", { exact: true }).fill("confirmed@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("safe-password");
    await page.getByRole("button", { name: "ログインする" }).click();

    await expect(page.locator('[data-auth-panel="visible"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
  });
});
