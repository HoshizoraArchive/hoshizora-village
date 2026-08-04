import { expect, test } from "@playwright/test";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_POST_ID = "22222222-2222-4222-8222-222222222222";

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

function createTestSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const user = {
    id: TEST_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "resonance-race@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
  };

  return {
    access_token: createUnsignedTestJwt({ aud: "authenticated", exp: nowSeconds + 3_600, sub: TEST_USER_ID }),
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "resonance-race-refresh-token",
    token_type: "bearer",
    user,
  };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "content-range": Array.isArray(body) ? `0-${Math.max(body.length - 1, 0)}/${body.length}` : "0-0/1",
    },
    body: JSON.stringify(body),
  });
}

async function mockVillage(page, controls) {
  const session = createTestSession();
  await page.addInitScript(
    ({ storedSession }) => {
      window.localStorage.setItem("sb-127-auth-token", JSON.stringify(storedSession));
    },
    { storedSession: session },
  );

  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (url.includes("/auth/v1/user")) {
      await fulfillJson(route, session.user);
      return;
    }

    if (url.includes("/auth/v1/token")) {
      await fulfillJson(route, session);
      return;
    }

    if (url.includes("/rest/v1/posts")) {
      if (controls.delayPosts) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await fulfillJson(route, [
        {
          id: TEST_POST_ID,
          author_id: TEST_USER_ID,
          type: "text",
          body: "共鳴数の更新競合テスト",
          visibility: "public",
          deleted_at: null,
          created_at: "2026-08-04T00:00:00.000Z",
        },
      ]);
      return;
    }

    if (url.includes("/rest/v1/profiles")) {
      const profile = {
        id: TEST_USER_ID,
        display_name: "共鳴テスター",
        username: "resonance_race",
        avatar_url: null,
        bio: null,
        constellation_note: null,
        active_frame_id: null,
        notify_authors_when_i_archive: true,
        notify_authors_when_i_resonate: true,
      };
      const accept = request.headers().accept || "";
      await fulfillJson(route, accept.includes("application/vnd.pgrst.object") ? profile : [profile]);
      return;
    }

    if (url.includes("/rest/v1/resonances")) {
      await fulfillJson(
        route,
        Array.from({ length: 5 }, (_, index) => ({
          id: `33333333-3333-4333-8333-33333333333${index}`,
          post_id: TEST_POST_ID,
          profile_id: TEST_USER_ID,
          type: "normal",
        })),
      );
      return;
    }

    await fulfillJson(route, []);
  });
}

async function triggerObservePullRefresh(page) {
  await page.evaluate(() => {
    const dispatchTouch = (type, touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: touches });
      window.dispatchEvent(event);
    };

    dispatchTouch("touchstart", [{ clientX: 120, clientY: 10 }]);
    dispatchTouch("touchmove", [{ clientX: 120, clientY: 105 }]);
    dispatchTouch("touchend", []);
  });
}

test("共鳴再取得が投稿再取得より先に完了しても観測更新後に共鳴数を0へ戻さない", async ({ page }) => {
  const controls = { delayPosts: false };
  await mockVillage(page, controls);
  await page.goto("/");

  const resonanceButton = page.getByRole("button", { name: "5 共鳴", exact: true }).first();
  await expect(resonanceButton).toBeVisible();

  controls.delayPosts = true;
  await triggerObservePullRefresh(page);
  await page.waitForTimeout(800);

  await expect(resonanceButton).toHaveAccessibleName("5 共鳴");
  await expect(page.getByRole("button", { name: "0 共鳴", exact: true })).toHaveCount(0);
});
