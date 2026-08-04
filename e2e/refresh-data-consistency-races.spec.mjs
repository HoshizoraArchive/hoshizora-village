import { expect, test } from "@playwright/test";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_POST_ID = "22222222-2222-4222-8222-222222222222";
const TEST_ARCHIVE_ID = "33333333-3333-4333-8333-333333333333";

function createSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = {
    id: TEST_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "refresh-race@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
  };

  return {
    access_token: `${encode({ alg: "none", typ: "JWT" })}.${encode({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: TEST_USER_ID,
    })}.test-signature`,
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "refresh-race-token",
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

function createPost(body) {
  return {
    id: TEST_POST_ID,
    author_id: TEST_USER_ID,
    type: "text",
    body,
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-04T00:00:00.000Z",
  };
}

function createProfile() {
  return {
    id: TEST_USER_ID,
    display_name: "整合性テスター",
    username: "consistency_tester",
    avatar_url: null,
    bio: null,
    constellation_note: null,
    active_frame_id: null,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
  };
}

function createResonances(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
    post_id: TEST_POST_ID,
    profile_id: TEST_USER_ID,
    resonance_type: "sparkle",
    created_at: `2026-08-04T00:00:${String(index).padStart(2, "0")}.000Z`,
  }));
}

function createThreadLetter() {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    post_id: TEST_POST_ID,
    author_id: TEST_USER_ID,
    parent_star_letter_id: null,
    body: "個別取得で届いた最新の星文",
    is_deleted: false,
    is_archived: false,
    total_resonance_count: 0,
    viewer_resonance_count: 0,
    created_at: "2026-08-04T00:02:00.000Z",
    updated_at: "2026-08-04T00:02:00.000Z",
    edited_at: null,
  };
}

async function mockVillage(page, overrides = {}) {
  const session = createSession();
  const controls = Object.assign(
    {
      archivePresent: true,
      archiveRefreshPhase: false,
      delayedArchiveReads: 0,
      delayedResonanceReads: 0,
      delayArchiveReads: false,
      delayGlobalStarLetters: false,
      delayResonanceReads: false,
      failResonanceReads: false,
      failTimelinePosts: false,
      globalStarLetterRefreshes: 0,
      postBody: "再同期race確認用の流星便",
      resonanceCount: 5,
      resonanceReadAttempts: 0,
      threadLetters: [createThreadLetter()],
      timelinePhase: false,
      timelineRefreshReads: 0,
      timelineReads: 0,
    },
    overrides,
  );

  await page.addInitScript(({ storedSession }) => {
    window.localStorage.setItem("sb-127-auth-token", JSON.stringify(storedSession));
  }, { storedSession: session });

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

    if (url.includes("/rest/v1/rpc/get_star_letter_thread")) {
      await fulfillJson(route, controls.threadLetters);
      return;
    }

    if (url.includes("/rest/v1/resonances")) {
      if (request.method() === "POST") {
        controls.resonanceCount += 1;
        await fulfillJson(route, []);
        return;
      }

      controls.resonanceReadAttempts += 1;
      const responseCount = controls.resonanceCount;

      if (controls.delayResonanceReads) {
        controls.delayedResonanceReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      if (controls.failResonanceReads) {
        await fulfillJson(route, { code: "RES_READ_FAILED", message: "resonance read failed" }, 500);
        return;
      }

      await fulfillJson(route, createResonances(responseCount));
      return;
    }

    if (url.includes("/rest/v1/star_letters")) {
      if (request.method() === "POST") {
        const submittedLetter = {
          ...createThreadLetter(),
          body: request.postDataJSON()?.body ?? createThreadLetter().body,
        };
        controls.threadLetters = [submittedLetter];
        await fulfillJson(route, submittedLetter, 201);
        return;
      }

      const responseLetters = [];

      if (controls.delayGlobalStarLetters) {
        controls.globalStarLetterRefreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      await fulfillJson(route, responseLetters);
      return;
    }

    if (url.includes("/rest/v1/star_letter_archives")) {
      await fulfillJson(route, []);
      return;
    }

    if (url.includes("/rest/v1/archives")) {
      if (controls.delayArchiveReads && controls.archiveRefreshPhase) {
        controls.delayedArchiveReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await fulfillJson(
        route,
        controls.archivePresent
          ? [{
              id: TEST_ARCHIVE_ID,
              profile_id: TEST_USER_ID,
              post_id: TEST_POST_ID,
              created_at: "2026-08-04T00:01:00.000Z",
            }]
          : [],
      );
      return;
    }

    if (url.includes("/rest/v1/posts")) {
      const isTimelineRequest = url.includes("visibility=eq.public") && url.includes("limit=20");
      let body = controls.postBody;

      if (isTimelineRequest) {
        controls.timelineReads += 1;

        if (controls.timelinePhase) {
          controls.timelineRefreshReads += 1;

          if (controls.timelineRefreshReads === 1 && controls.delayFirstTimelineRefresh) {
            body = controls.firstTimelineBody;
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          } else if (controls.timelineRefreshReads >= 2 && controls.latestTimelineBody) {
            body = controls.latestTimelineBody;
          }
        }

        if (controls.failTimelinePosts) {
          await fulfillJson(route, { code: "POST_READ_FAILED", message: "post read failed" }, 500);
          return;
        }
      }

      await fulfillJson(route, [createPost(body)]);
      return;
    }

    if (url.includes("/rest/v1/profiles")) {
      const profile = createProfile();
      const accept = request.headers().accept || "";
      await fulfillJson(route, accept.includes("application/vnd.pgrst.object") ? profile : [profile]);
      return;
    }

    await fulfillJson(route, []);
  });

  return controls;
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

async function triggerForegroundRefresh(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(420);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

async function expectResonanceCount(page, count) {
  await expect(page.getByRole("button", { name: new RegExp(`${count} 共鳴$`) }).first()).toBeVisible();
}

test("Archive再取得が共鳴取得より遅くても5を0へ戻さない", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 5 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expectResonanceCount(page, 5);

  controls.delayArchiveReads = true;
  controls.archiveRefreshPhase = true;
  await triggerForegroundRefresh(page);
  await expect.poll(() => controls.delayedArchiveReads).toBeGreaterThan(0);
  await page.waitForTimeout(650);

  await expectResonanceCount(page, 5);
  await expect(page.getByRole("button", { name: /0 共鳴$/ })).toHaveCount(0);
});

test("共鳴成功後に完了した古い0件GETを無視する", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 0 });
  await page.goto("/");
  await expectResonanceCount(page, 0);

  controls.delayResonanceReads = true;
  await triggerForegroundRefresh(page);
  await expect.poll(() => controls.delayedResonanceReads).toBeGreaterThan(0);

  await page.getByRole("button", { name: /0 共鳴$/ }).first().click();
  await expectResonanceCount(page, 1);
  await page.waitForTimeout(800);

  await expectResonanceCount(page, 1);
  await expect(page.getByRole("button", { name: /0 共鳴$/ })).toHaveCount(0);
});

test("星文追加成功後の個別GETより古い全体GETで1件を0件へ戻さない", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 0, threadLetters: [] });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "星文 0" }).first()).toBeVisible();
  await page.getByRole("button", { name: "星文 0" }).first().click();
  await expect(page.getByText("まだ星文はありません。")).toBeVisible();

  controls.delayGlobalStarLetters = true;
  await triggerForegroundRefresh(page);
  await expect.poll(() => controls.globalStarLetterRefreshes).toBeGreaterThan(0);

  await page.getByPlaceholder("この流星便に星文を残す").fill("mutationで届いた最新の星文");
  await page.getByRole("button", { name: "星文を送る" }).click();
  await expect(page.getByText("mutationで届いた最新の星文")).toBeVisible();
  await expect(page.getByRole("button", { name: "星文 1" }).first()).toBeVisible();
  await page.waitForTimeout(800);

  await expect(page.getByText("mutationで届いた最新の星文")).toBeVisible();
  await expect(page.getByRole("button", { name: "星文 1" }).first()).toBeVisible();
});

test("pull-to-refresh中のforeground復帰は最新posts再取得を後続実行する", async ({ page }) => {
  const controls = await mockVillage(page, {
    delayFirstTimelineRefresh: true,
    firstTimelineBody: "先行更新の古い本文",
    latestTimelineBody: "後発更新の最新本文",
    postBody: "更新前の本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  await expect(page.getByText("更新前の本文")).toBeVisible();

  controls.timelinePhase = true;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.timelineRefreshReads).toBe(1);
  await triggerForegroundRefresh(page);

  await expect.poll(() => controls.timelineRefreshReads).toBe(2);
  await expect(page.getByText("後発更新の最新本文")).toBeVisible();
  await expect(page.getByText("先行更新の古い本文")).toHaveCount(0);
});

test("増減・真の0・取得失敗を収束させ同一postを全viewで一致させる", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 5 });
  await page.goto("/");
  await expectResonanceCount(page, 5);

  controls.delayResonanceReads = true;
  controls.resonanceCount = 2;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.delayedResonanceReads).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  await expectResonanceCount(page, 5);
  await expect(page.getByRole("button", { name: /0 共鳴$/ })).toHaveCount(0);
  await expectResonanceCount(page, 2);
  controls.delayResonanceReads = false;

  controls.resonanceCount = 0;
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 0);

  controls.resonanceCount = 4;
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 4);

  const readsBeforeFailure = controls.resonanceReadAttempts;
  controls.failResonanceReads = true;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.resonanceReadAttempts).toBeGreaterThan(readsBeforeFailure);
  await expectResonanceCount(page, 4);

  controls.failResonanceReads = false;
  controls.failTimelinePosts = true;
  controls.resonanceCount = 1;
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 1);
  controls.failTimelinePosts = false;

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "Archive", exact: true }).click();
  await expectResonanceCount(page, 1);

  await page.getByRole("link", { name: "整合性テスターの流星便を開く" }).first().click();
  await expectResonanceCount(page, 1);

  await page.getByRole("button", { name: "整合性テスターの星座を開く" }).first().click();
  await expectResonanceCount(page, 1);

  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("tab", { name: /^共鳴/ }).click();
  await expectResonanceCount(page, 1);
});
