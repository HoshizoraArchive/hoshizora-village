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
  await expect(page.getByText("Supabase Auth", { exact: true })).toBeVisible();
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

async function installStoredAuthSession(page, { email, onUserRequest, userId }) {
  const accessToken = createUnsignedTestJwt({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3_600,
    sub: userId,
  });
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
  };

  await page.route("**/__supabase/auth/v1/user", async (route) => {
    onUserRequest?.(route.request());
    await fulfillAuthJson(route, user);
  });
  await page.addInitScript(
    ({ session }) => {
      window.localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    },
    {
      session: {
        access_token: accessToken,
        expires_at: Math.floor(Date.now() / 1000) + 3_600,
        expires_in: 3_600,
        refresh_token: "test-normal-refresh-token",
        token_type: "bearer",
        user,
      },
    },
  );

  return { accessToken, user };
}

test.describe("星空Village browser smoke", () => {
  test("ゲスト状態でアプリとログインUIが起動する", async ({ page }) => {
    await openVillageAsGuest(page);

    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: "村へ帰る", exact: true })).toBeVisible();

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
    await page.getByRole("button", { name: "入村手続き（会員登録）", exact: true }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("new-villager@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("safe-password");
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
    await page.getByLabel("私は18歳以上であることを確認します").check();
    await page.getByRole("button", { name: "入村する" }).click();

    await expect(page.getByRole("heading", { name: "会員登録できました！" })).toBeVisible();
    await expect(page.getByText("new-villager@example.com 宛に確認メールを送りました。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "入村する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /秒後に再送できます/ })).toBeDisabled();
    expect(signupRequests).toBe(1);
  });

  test("初回会員登録のrate limitは登録完了扱いにせず再試行可能にする", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let signupRequests = 0;

    await page.route("**/__supabase/auth/v1/signup", async (route) => {
      signupRequests += 1;
      await fulfillAuthJson(
        route,
        {
          error_code: "over_email_send_rate_limit",
          msg: "Email rate limit exceeded",
        },
        429,
      );
    });

    await page.goto("/");
    await page.getByRole("button", { name: "入村手続き（会員登録）", exact: true }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("rate-limited@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("safe-password");
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
    await page.getByLabel("私は18歳以上であることを確認します").check();
    await page.getByRole("button", { name: "入村する" }).click();

    await expect(
      page.getByText("会員登録を完了できませんでした。少し待ってから、もう一度お試しください。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "会員登録できました！" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "確認メールを再送する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "入村する" })).toBeEnabled();
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
    await page.getByRole("button", { name: "村へ帰る", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "メールアドレスの確認がまだ完了していません。" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "確認メールを再送する" })).toBeEnabled();
  });

  test("確認成功画面を閉じてから初回オンボーディングを開始する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    const userId = "33333333-3333-4333-8333-333333333333";
    const accessToken = createUnsignedTestJwt({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3_600,
      sub: userId,
    });
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "new-confirmed@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    };
    let onboardingRequests = 0;

    await page.route("**/__supabase/auth/v1/user", async (route) => {
      await fulfillAuthJson(route, user);
    });
    await page.route("**/__supabase/rest/v1/user_onboarding_progress*", async (route) => {
      onboardingRequests += 1;
      await fulfillAuthJson(route, {
        user_id: userId,
        current_step: "welcome_video",
        welcome_video_status: "pending",
        welcome_video_completed_at: null,
        profile_completed_at: null,
        target_post_id: null,
        archive_completed_at: null,
        archive_confirmed_at: null,
        notification_permission_status: "unknown",
        notification_permission_updated_at: null,
        push_registered_at: null,
        push_registration_status: "not_started",
        push_test_status: "not_started",
        push_test_updated_at: null,
        first_post_id: null,
        first_post_completed_at: null,
        completed_at: null,
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      });
    });
    await page.addInitScript(
      ({ session }) => {
        window.localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      },
      {
        session: {
          access_token: accessToken,
          expires_at: Math.floor(Date.now() / 1000) + 3_600,
          expires_in: 3_600,
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          user,
        },
      },
    );

    await page.goto("/?type=signup");

    await expect(page.getByRole("heading", { name: "メールアドレスを確認しました" })).toBeVisible();
    await expect.poll(() => onboardingRequests).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toHaveCount(0);

    await page.getByRole("button", { name: "案内へ進む" }).click();

    await expect(page.getByRole("heading", { name: "メールアドレスを確認しました" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toBeVisible();
  });

  test("パスワード再設定要求から更新完了まで専用画面で進行する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    const userId = "44444444-4444-4444-8444-444444444444";
    const accessToken = createUnsignedTestJwt({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3_600,
      sub: userId,
    });
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "recovering@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    };
    let resetRequests = 0;
    let passwordUpdates = 0;

    await page.route("**/__supabase/auth/v1/recover*", async (route) => {
      resetRequests += 1;
      const requestUrl = new URL(route.request().url());
      const body = route.request().postDataJSON();

      expect(body.email).toBe("recovering@example.com");
      expect(requestUrl.searchParams.get("redirect_to")).toBe(
        "http://127.0.0.1:4173/auth/recovery",
      );
      await fulfillAuthJson(route, {});
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "パスワードを忘れた方" })).toBeVisible();
    await page.getByLabel("メールアドレス", { exact: true }).fill("recovering@example.com");
    await page.getByRole("button", { name: "パスワードを忘れた方" }).click();
    await expect(page.getByRole("heading", { name: "パスワードを再設定" })).toBeVisible();
    await page.getByRole("button", { name: "再設定メールを送る" }).click();

    await expect(
      page.getByRole("heading", { name: "パスワード再設定メールを送信しました。" }),
    ).toBeVisible();
    await expect(page.getByText(/秒後に再送できます/)).toBeVisible();
    expect(resetRequests).toBe(1);

    await page.route("**/__supabase/auth/v1/user", async (route) => {
      if (route.request().method() === "PUT") {
        passwordUpdates += 1;
        expect(route.request().postDataJSON().password).toBe("new-safe-password");
      }

      await fulfillAuthJson(route, user);
    });
    await page.route("**/__supabase/rest/v1/user_onboarding_progress*", async (route) => {
      await fulfillAuthJson(route, {
        user_id: userId,
        current_step: "welcome_video",
        welcome_video_status: "pending",
        welcome_video_completed_at: null,
        profile_completed_at: null,
        target_post_id: null,
        archive_completed_at: null,
        archive_confirmed_at: null,
        notification_permission_status: "unknown",
        notification_permission_updated_at: null,
        push_registered_at: null,
        push_registration_status: "not_started",
        push_test_status: "not_started",
        push_test_updated_at: null,
        first_post_id: null,
        first_post_completed_at: null,
        completed_at: null,
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      });
    });
    await page.goto(
      `/auth/recovery#access_token=${accessToken}&expires_in=3600&refresh_token=test-recovery-refresh-token&token_type=bearer&type=recovery`,
    );
    await expect(page.getByRole("heading", { name: "新しいパスワードを設定" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toHaveCount(0);

    await page.getByLabel("新しいパスワード", { exact: true }).fill("new-safe-password");
    await page.getByLabel("新しいパスワード（確認）", { exact: true }).fill("different-password");
    await page.getByRole("button", { name: "パスワードを変更する" }).click();

    await expect(page.getByText("新しいパスワードが一致していません。", { exact: true })).toBeVisible();
    expect(passwordUpdates).toBe(0);

    await page.getByLabel("新しいパスワード（確認）", { exact: true }).fill("new-safe-password");
    await page.getByRole("button", { name: "パスワードを変更する" }).click();

    await expect(page.getByRole("heading", { name: "パスワードを変更しました。" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toHaveCount(0);
    expect(passwordUpdates).toBe(1);

    await page.getByRole("button", { name: "星空Villageへ進む" }).click();
    await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toBeVisible();
  });

  test("通常sessionでRecovery pathを直接開いてもパスワードを変更できない", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let passwordUpdates = 0;
    await installStoredAuthSession(page, {
      email: "normally-signed-in@example.com",
      onUserRequest: (request) => {
        if (request.method() === "PUT") {
          passwordUpdates += 1;
        }
      },
      userId: "55555555-5555-4555-8555-555555555555",
    });

    await page.goto("/auth/recovery");

    await expect(
      page.getByRole("heading", {
        name: "このパスワード再設定リンクは古いか、期限切れになっています。",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "新しいパスワードを設定" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "パスワードを変更する" })).toHaveCount(0);
    expect(passwordUpdates).toBe(0);
  });

  test("別ユーザーの通常sessionをtypeだけでRecovery対象にしない", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let passwordUpdates = 0;
    await installStoredAuthSession(page, {
      email: "different-session@example.com",
      onUserRequest: (request) => {
        if (request.method() === "PUT") {
          passwordUpdates += 1;
        }
      },
      userId: "66666666-6666-4666-8666-666666666666",
    });

    await page.goto("/auth/recovery?type=recovery");

    await expect(
      page.getByRole("heading", {
        name: "このパスワード再設定リンクは古いか、期限切れになっています。",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "新しいパスワードを設定" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "パスワードを変更する" })).toHaveCount(0);
    expect(passwordUpdates).toBe(0);
  });

  test("再設定メールはsingle-flightで送信しrate limitを安全に表示する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let resetRequests = 0;

    await page.route("**/__supabase/auth/v1/recover*", async (route) => {
      resetRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fulfillAuthJson(
        route,
        {
          error_code: "over_email_send_rate_limit",
          msg: "Email rate limit exceeded",
        },
        429,
      );
    });

    await page.goto("/");
    await page.getByRole("button", { name: "パスワードを忘れた方" }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("rate-limited@example.com");
    await page.getByRole("button", { name: "再設定メールを送る" }).evaluate((button) => {
      button.click();
      button.click();
    });

    await expect(
      page.getByText("送信回数が上限に達しました。少し待ってからもう一度お試しください。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "パスワード再設定メールを送信しました。" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /秒後に再送できます/ })).toBeDisabled();
    expect(resetRequests).toBe(1);
  });

  test("未登録かもしれないメールでもアカウント存在有無を表示しない", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);

    await page.route("**/__supabase/auth/v1/recover*", async (route) => {
      await fulfillAuthJson(
        route,
        {
          error_code: "user_not_found",
          msg: "User not found",
        },
        400,
      );
    });

    await page.goto("/");
    await page.getByRole("button", { name: "パスワードを忘れた方" }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("unknown@example.com");
    await page.getByRole("button", { name: "再設定メールを送る" }).click();

    await expect(
      page.getByRole("heading", { name: "パスワード再設定メールを送信しました。" }),
    ).toBeVisible();
    await expect(page.getByText(/登録されていません|ユーザーが存在しません/)).toHaveCount(0);
  });

  test("account lookup以外の400は送信済みにせずsafe errorを表示する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);

    await page.route("**/__supabase/auth/v1/recover*", async (route) => {
      await fulfillAuthJson(
        route,
        {
          error_code: "validation_failed",
          msg: "Invalid recovery request",
        },
        400,
      );
    });

    await page.goto("/");
    await page.getByRole("button", { name: "パスワードを忘れた方" }).click();
    await page.getByLabel("メールアドレス", { exact: true }).fill("invalid-request@example.com");
    await page.getByRole("button", { name: "再設定メールを送る" }).click();

    await expect(
      page.getByText(
        "パスワード再設定メールを送信できませんでした。時間をおいてもう一度お試しください。",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "パスワード再設定メールを送信しました。" }),
    ).toHaveCount(0);
  });

  test("期限切れRecoveryリンクはsignup確認と混同せず再送へ復旧する", async ({ page }) => {
    await mockSupabaseAsEmptyVillage(page);
    let resetRequests = 0;

    await page.route("**/__supabase/auth/v1/recover*", async (route) => {
      resetRequests += 1;
      await fulfillAuthJson(route, {});
    });

    await page.goto(
      "/auth/recovery?type=recovery&error=access_denied&error_code=otp_expired&error_description=Recovery+link+expired",
    );

    await expect(
      page.getByRole("heading", {
        name: "このパスワード再設定リンクは古いか、期限切れになっています。",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "この確認リンクは古いか、期限切れになっています。" }),
    ).toHaveCount(0);

    await page.getByLabel("メールアドレス", { exact: true }).fill("recovering@example.com");
    await page.getByRole("button", { name: "再設定メールを送る" }).click();

    await expect(
      page.getByRole("heading", { name: "パスワード再設定メールを送信しました。" }),
    ).toBeVisible();
    expect(resetRequests).toBe(1);
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
    await page.getByRole("button", { name: "村へ帰る", exact: true }).click();

    await expect(page.locator('[data-auth-panel="visible"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
  });
});