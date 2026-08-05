import { expect, test } from "@playwright/test";

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "content-range": "0-0/0",
    },
    body: JSON.stringify(body),
  });
}

async function installAuthenticatedOnboarding(page, initialStep) {
  const userId = "77777777-7777-4777-8777-777777777777";
  const accessToken = createUnsignedTestJwt({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3_600,
    sub: userId,
  });
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "onboarding-flow@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
  };
  let skipped = false;
  const rpcBodies = [];

  await page.route("**/__supabase/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await fulfillJson(route, []);
  });

  await page.route("**/__supabase/auth/v1/user", async (route) => {
    await fulfillJson(route, user);
  });

  await page.route("**/__supabase/rest/v1/user_onboarding_progress*", async (route) => {
    await fulfillJson(route, {
      user_id: userId,
      current_step: skipped ? "completed" : initialStep,
      welcome_video_status: initialStep === "welcome_video" ? "pending" : "skipped",
      welcome_video_completed_at: initialStep === "welcome_video" ? null : "2026-08-05T00:00:01.000Z",
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
      completed_at: skipped ? "2026-08-05T00:05:00.000Z" : null,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: skipped ? "2026-08-05T00:05:00.000Z" : "2026-08-05T00:00:00.000Z",
    });
  });

  await page.route("**/__supabase/rest/v1/rpc/advance_initial_onboarding", async (route) => {
    const body = route.request().postDataJSON();
    rpcBodies.push(body);

    if (body?.p_action === "skip_all") {
      skipped = true;
      await fulfillJson(route, {
        outcome: "advanced",
        progress: {
          user_id: userId,
          current_step: "completed",
          completed_at: "2026-08-05T00:05:00.000Z",
          skipped_at: "2026-08-05T00:05:00.000Z",
          skipped_from_step: initialStep,
        },
      });
      return;
    }

    await fulfillJson(route, { outcome: "invalid_action", progress: null }, 400);
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
        refresh_token: "onboarding-flow-refresh-token",
        token_type: "bearer",
        user,
      },
    },
  );

  return { rpcBodies };
}

test("通常のちあ案内は小さくして戻してもReact内の全体スキップが壊れない", async ({ page }) => {
  const { rpcBodies } = await installAuthenticatedOnboarding(page, "mini_chia_intro");

  await page.goto("/");

  const guide = page.getByRole("region", { name: "星空ちあの入村案内" });
  const skipAll = guide.getByRole("button", { name: "ちあの入村案内をすべてスキップ" });

  await expect(guide).toBeVisible();
  await expect(skipAll).toBeVisible();

  await page.getByRole("button", { name: "ちあの案内を小さくする" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "ちあの案内を見る" }).click();

  await expect(guide).toBeVisible();
  await expect(skipAll).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await skipAll.click();

  await expect(guide).toHaveCount(0);
  await expect.poll(() => rpcBodies.filter((body) => body?.p_action === "skip_all").length).toBe(1);
  expect(rpcBodies.at(-1)).toMatchObject({
    p_action: "skip_all",
    p_status: null,
    p_target_id: null,
  });
});

test("Welcome画面からの全体スキップも同じRPCで完了し二重送信しない", async ({ page }) => {
  const { rpcBodies } = await installAuthenticatedOnboarding(page, "welcome_video");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toBeVisible();
  const skipAll = page.getByRole("button", { name: "ちあの入村案内をすべてスキップ" });
  await expect(skipAll).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await skipAll.dblclick({ delay: 20 });

  await expect(page.getByRole("heading", { name: "入村案内をはじめます" })).toHaveCount(0);
  await expect.poll(() => rpcBodies.filter((body) => body?.p_action === "skip_all").length).toBe(1);
});
