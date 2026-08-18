import { expect, test } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHIA_ID = "22222222-2222-4222-8222-222222222222";
const FRAME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GIFT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROFILE_DELAY_MS = 3_500;

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

function createSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "gift-navigation@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  };

  return {
    access_token: createUnsignedTestJwt({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: USER_ID,
    }),
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "gift-navigation-refresh-token",
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
      "content-range": Array.isArray(body)
        ? `0-${Math.max(body.length - 1, 0)}/${body.length}`
        : "0-0/1",
    },
    body: JSON.stringify(body),
  });
}

function asPostgrestResponse(request, rows) {
  const accept = request.headers().accept ?? "";
  return accept.includes("application/vnd.pgrst.object") ? rows[0] ?? null : rows;
}

async function mockDelayedProfileGiftVillage(page) {
  const session = createSession();
  const profile = {
    id: USER_ID,
    display_name: "Opening Memorial導線テスター",
    username: "opening_gift_nav",
    avatar_url: null,
    bio: "贈りもの導線の遅延読込確認用プロフィールです。",
    constellation_note: null,
    active_frame_id: FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
    notify_chia_posts: true,
    profile_titles: [],
    profile_cohorts: [],
  };
  const gift = {
    id: GIFT_ID,
    recipient_id: USER_ID,
    actor_id: CHIA_ID,
    post_id: null,
    star_letter_id: null,
    content_report_id: null,
    type: "opening_memorial_gift",
    message: "星空ちあからアイコンフレームが届きました！",
    is_read: false,
    created_at: "2026-08-18T00:00:00.000Z",
  };

  await page.addInitScript(({ storedSession }) => {
    window.localStorage.setItem("sb-127-auth-token", JSON.stringify(storedSession));
  }, { storedSession: session });

  await page.route(/(?:\/__supabase\/|https:\/\/[^/]+\.supabase\.co\/)/, async (route) => {
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

    if (url.includes("/rest/v1/notifications")) {
      if (request.method() === "PATCH") {
        await fulfillJson(route, []);
        return;
      }

      const typeFilter = new URL(url).searchParams.get("type") ?? "";
      const rows = typeFilter === "eq.opening_memorial_gift" ? [gift] : [];
      await fulfillJson(route, asPostgrestResponse(request, rows));
      return;
    }

    if (url.includes("/rest/v1/profiles")) {
      await new Promise((resolve) => setTimeout(resolve, PROFILE_DELAY_MS));
      await fulfillJson(route, asPostgrestResponse(request, [profile]));
      return;
    }

    if (url.includes("/rest/v1/profile_frames")) {
      await fulfillJson(route, [{
        id: FRAME_ID,
        frame_key: "opening_memorial_beta",
        name: "Opening Memorial｜First Resident",
        description: "開村記念プロフィールアイコンフレーム",
        asset_path: "/profile-frames/opening-memorial.png",
        acquisition_type: "beta_reward",
        rarity: "special",
        frame_scale: 1.15,
        frame_offset_x: 0,
        frame_offset_y: 0,
        is_active: true,
        created_at: "2026-08-18T00:00:00.000Z",
        updated_at: "2026-08-18T00:00:00.000Z",
      }]);
      return;
    }

    if (url.includes("/rest/v1/profile_frame_ownerships")) {
      await fulfillJson(route, [{
        profile_id: USER_ID,
        frame_id: FRAME_ID,
        acquisition_source: "beta_resident",
        granted_at: "2026-08-18T00:00:00.000Z",
      }]);
      return;
    }

    if (
      url.includes("/rest/v1/posts") ||
      url.includes("/rest/v1/rpc/get_post_snapshots_v1") ||
      url.includes("/rest/v1/rpc/get_post_engagement_snapshots_v1") ||
      url.includes("/rest/v1/rpc/get_star_thread_snapshots_v1") ||
      url.includes("/rest/v1/rpc/get_archived_post_snapshots_v1")
    ) {
      await fulfillJson(route, []);
      return;
    }

    await fulfillJson(route, []);
  });
}

test("Opening Memorialのフレームを見るは遅いプロフィール読込後も編集画面のフレーム欄まで進む", async ({ page }) => {
  await mockDelayedProfileGiftVillage(page);
  await page.goto("/");

  const giftModal = page.locator('[data-opening-memorial-gift-modal="true"]');
  await expect(giftModal).toBeVisible({ timeout: 5_000 });
  await giftModal.getByRole("button", { name: "フレームを見る", exact: true }).click();

  const navigation = page.getByRole("navigation", {
    name: "星空Village bottom navigation",
  });
  await expect(
    navigation.getByRole("button", { name: "My Universe", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await expect(
    page.getByRole("heading", { name: "プロフィール編集", exact: true }),
  ).toBeVisible({ timeout: 10_000 });

  const frameLabel = page.getByText("アイコンフレーム", { exact: true });
  await expect(frameLabel).toBeVisible();
  await expect.poll(async () => frameLabel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  })).toBe(true);
});
