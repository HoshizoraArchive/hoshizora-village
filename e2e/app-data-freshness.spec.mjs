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
    email: "freshness@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
  };

  return {
    access_token: createUnsignedTestJwt({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: TEST_USER_ID,
    }),
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "freshness-refresh-token",
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

function countRead(counters, url) {
  if (url.includes("/rest/v1/posts")) counters.posts += 1;
  if (url.includes("/rest/v1/resonances")) counters.resonances += 1;
  if (url.includes("/rest/v1/star_letters")) counters.starLetters += 1;
  if (url.includes("/rest/v1/archives")) counters.archives += 1;
}

async function mockVillage(page, counters, { authenticated = false, withPost = false } = {}) {
  const session = createTestSession();

  if (authenticated) {
    await page.addInitScript(
      ({ storedSession }) => {
        window.localStorage.setItem("sb-127-auth-token", JSON.stringify(storedSession));
      },
      { storedSession: session },
    );
  }

  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (url.includes("/auth/v1/user")) {
      if (authenticated) {
        await fulfillJson(route, session.user);
      } else {
        await fulfillJson(route, { message: "not authenticated" }, 401);
      }
      return;
    }

    if (url.includes("/auth/v1/token")) {
      await fulfillJson(route, authenticated ? session : { message: "not authenticated" }, authenticated ? 200 : 401);
      return;
    }

    countRead(counters, url);

    if (url.includes("/rest/v1/posts") && withPost) {
      await fulfillJson(route, [
        {
          id: TEST_POST_ID,
          author_id: TEST_USER_ID,
          type: "text",
          body: "再同期確認用の流星便",
          visibility: "public",
          deleted_at: null,
          created_at: "2026-08-03T00:00:00.000Z",
        },
      ]);
      return;
    }

    if (url.includes("/rest/v1/profiles") && authenticated) {
      const profile = {
        id: TEST_USER_ID,
        display_name: "再同期テスター",
        username: "freshness_tester",
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

function snapshotCardReads(counters) {
  return {
    posts: counters.posts,
    resonances: counters.resonances,
    starLetters: counters.starLetters,
    archives: counters.archives,
  };
}

function allCardReadsAdvanced(counters, before) {
  return (
    counters.posts > before.posts &&
    counters.resonances > before.resonances &&
    counters.starLetters > before.starLetters &&
    counters.archives > before.archives
  );
}

test("観測欄を引いて更新すると投稿・共鳴・星文・Archiveを全部再取得する", async ({ page }) => {
  const counters = { posts: 0, resonances: 0, starLetters: 0, archives: 0 };
  await mockVillage(page, counters, { authenticated: true, withPost: true });
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
  await expect.poll(() => counters.posts).toBeGreaterThan(0);
  await expect.poll(() => counters.resonances).toBeGreaterThan(0);
  await expect.poll(() => counters.starLetters).toBeGreaterThan(0);
  await expect.poll(() => counters.archives).toBeGreaterThan(0);
  const before = snapshotCardReads(counters);
  let unexpectedNavigations = 0;

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      unexpectedNavigations += 1;
    }
  });

  await triggerObservePullRefresh(page);

  await expect.poll(() => allCardReadsAdvanced(counters, before)).toBe(true);
  expect(unexpectedNavigations).toBe(0);
  await expect(
    page.getByRole("navigation", { name: "星空Village bottom navigation" }).getByRole("button", {
      name: "観測",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
});

test("PWA復帰相当のpagehide→focusでも投稿カード関連データを全部再取得する", async ({ page }) => {
  const counters = { posts: 0, resonances: 0, starLetters: 0, archives: 0 };
  await mockVillage(page, counters, { authenticated: true, withPost: true });
  await page.goto("/");

  await expect.poll(() => counters.posts).toBeGreaterThan(0);
  await expect.poll(() => counters.resonances).toBeGreaterThan(0);
  await expect.poll(() => counters.starLetters).toBeGreaterThan(0);
  await expect.poll(() => counters.archives).toBeGreaterThan(0);
  const before = snapshotCardReads(counters);
  let unexpectedNavigations = 0;

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      unexpectedNavigations += 1;
    }
  });

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(420);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect.poll(() => allCardReadsAdvanced(counters, before)).toBe(true);
  expect(unexpectedNavigations).toBe(0);
});

test("星文を書いてblurしていてもPWA復帰再同期で下書きを保持する", async ({ page }) => {
  const counters = { posts: 0, resonances: 0, starLetters: 0, archives: 0 };
  await mockVillage(page, counters, { authenticated: true, withPost: true });
  await page.goto("/");

  await expect.poll(() => counters.posts).toBeGreaterThan(0);
  const starLetterButton = page.getByRole("button", { name: "星文 0" }).first();
  await expect(starLetterButton).toBeVisible();
  await starLetterButton.click();
  const starLetterDraft = page.getByPlaceholder("この流星便に星文を残す").first();
  await starLetterDraft.fill("まだ送っていない星文の下書き");
  await starLetterDraft.evaluate((input) => input.setAttribute("data-refresh-guard-probe", "keep"));
  await starLetterDraft.blur();
  const before = snapshotCardReads(counters);

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(420);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect.poll(() => allCardReadsAdvanced(counters, before)).toBe(true);
  await expect(starLetterDraft).toHaveValue("まだ送っていない星文の下書き");
  await expect(starLetterDraft).toHaveAttribute("data-refresh-guard-probe", "keep");
});
