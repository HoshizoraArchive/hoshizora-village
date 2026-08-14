import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const avatarFixture = fs.readFileSync(
  path.join(currentDir, "fixtures/opening-memorial-avatar.jpg"),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHIA_ID = "22222222-2222-4222-8222-222222222222";
const FRAMELESS_ID = "33333333-3333-4333-8333-333333333333";
const OPENING_FRAME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHIA_FRAME_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPENING_POST_ID = "44444444-4444-4444-8444-444444444444";
const CHIA_POST_ID = "55555555-5555-4555-8555-555555555555";
const FRAMELESS_POST_ID = "66666666-6666-4666-8666-666666666666";
const STAR_LETTER_ID = "77777777-7777-4777-8777-777777777777";
const REVISION_EPOCH = "88888888-8888-4888-8888-888888888888";
const AVATAR_FIXTURE_URL = "https://fixture.invalid/opening-memorial-avatar.jpg";
const screenshotDirectory = process.env.OPENING_MEMORIAL_SCREENSHOT_DIR
  ? path.resolve(process.cwd(), process.env.OPENING_MEMORIAL_SCREENSHOT_DIR)
  : "";
const authStorageKeys = [
  "sb-127-auth-token",
  process.env.PROFILE_FRAME_AUTH_STORAGE_KEY,
].filter(Boolean);

const profiles = [
  {
    id: USER_ID,
    display_name: "Opening Memorialテスター",
    username: "opening_tester",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: "開村記念フレームの表示確認用プロフィールです。",
    constellation_note: null,
    active_frame_id: OPENING_FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
  },
  {
    id: CHIA_ID,
    display_name: "星空ちあ",
    username: "chia_fixture",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: null,
    constellation_note: null,
    active_frame_id: CHIA_FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
  },
  {
    id: FRAMELESS_ID,
    display_name: "フレームなし住民",
    username: "frameless_fixture",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: null,
    constellation_note: null,
    active_frame_id: null,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
  },
];

const posts = [
  {
    id: OPENING_POST_ID,
    author_id: USER_ID,
    type: "text",
    body: "Opening Memorialの通常サイズ確認用流星便",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T03:00:00.000Z",
  },
  {
    id: CHIA_POST_ID,
    author_id: CHIA_ID,
    type: "text",
    body: "chia_guideの回帰確認用流星便",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T02:00:00.000Z",
  },
  {
    id: FRAMELESS_POST_ID,
    author_id: FRAMELESS_ID,
    type: "text",
    body: "フレームなし表示の回帰確認用流星便",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T01:00:00.000Z",
  },
];

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

function createTestSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "opening-frame@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };

  return {
    access_token: createUnsignedTestJwt({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: USER_ID,
    }),
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "opening-frame-refresh-token",
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

function requestedIds(request) {
  try {
    const body = request.postDataJSON();
    return body?.p_post_ids ?? [];
  } catch {
    return [];
  }
}

function profileRowsForUrl(url) {
  const parsed = new URL(url);
  const idFilter = parsed.searchParams.get("id") ?? "";
  const usernameFilter = parsed.searchParams.get("username") ?? "";

  if (idFilter.startsWith("eq.")) {
    return profiles.filter((profile) => profile.id === idFilter.slice(3));
  }

  if (usernameFilter.startsWith("eq.")) {
    return profiles.filter((profile) => profile.username === usernameFilter.slice(3));
  }

  return profiles;
}

function postRowsForUrl(url) {
  const parsed = new URL(url);
  const authorFilter = parsed.searchParams.get("author_id") ?? "";

  return authorFilter.startsWith("eq.")
    ? posts.filter((post) => post.author_id === authorFilter.slice(3))
    : posts;
}

function postSnapshot(post) {
  return {
    ...post,
    post_id: post.id,
    available: true,
    tombstoned: false,
    revision_epoch: REVISION_EPOCH,
    content_revision: "1",
    assets_revision: "1",
    viewer_context_revision: "1",
    media_rows: [],
    tag_rows: [],
  };
}

async function mockFramedVillage(page) {
  const session = createTestSession();

  await page.addInitScript(
    ({ storageKeys, storedSession }) => {
      for (const storageKey of storageKeys) {
        window.localStorage.setItem(storageKey, JSON.stringify(storedSession));
      }
    },
    { storageKeys: authStorageKeys, storedSession: session },
  );

  await page.route(AVATAR_FIXTURE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: avatarFixture,
    });
  });

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

    if (url.includes("/rest/v1/profile_frames")) {
      await fulfillJson(route, [
        {
          id: OPENING_FRAME_ID,
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
          created_at: "2026-08-14T00:00:00.000Z",
          updated_at: "2026-08-14T00:00:00.000Z",
        },
        {
          id: CHIA_FRAME_ID,
          frame_key: "chia_guide",
          name: "星空ちあ｜街の案内人",
          description: "星空ちあ専用のプロフィールアイコンフレーム",
          asset_path: "/profile-frames/chia-guide.png",
          acquisition_type: "admin_grant",
          rarity: "special",
          frame_scale: 1.22,
          frame_offset_x: 0,
          frame_offset_y: 0,
          is_active: true,
          created_at: "2026-07-02T00:00:00.000Z",
          updated_at: "2026-07-02T00:00:00.000Z",
        },
      ]);
      return;
    }

    if (url.includes("/rest/v1/profile_frame_ownerships")) {
      await fulfillJson(route, [{
        profile_id: USER_ID,
        frame_id: OPENING_FRAME_ID,
        acquisition_source: "beta_resident",
        granted_at: "2026-08-14T00:00:00.000Z",
      }]);
      return;
    }

    if (url.includes("/rest/v1/profiles")) {
      const rows = profileRowsForUrl(url);
      const accept = request.headers().accept ?? "";
      await fulfillJson(
        route,
        accept.includes("application/vnd.pgrst.object") ? rows[0] ?? null : rows,
      );
      return;
    }

    if (url.includes("/rest/v1/rpc/get_post_snapshots_v1")) {
      const ids = requestedIds(request);
      await fulfillJson(route, posts.filter((post) => ids.includes(post.id)).map(postSnapshot));
      return;
    }

    if (url.includes("/rest/v1/rpc/get_post_engagement_snapshots_v1")) {
      await fulfillJson(route, requestedIds(request).map((postId) => ({
        post_id: postId,
        revision_epoch: REVISION_EPOCH,
        resonance_count: 0,
        viewer_resonance_count: 0,
        resonance_revision: "1",
        is_archived: false,
        archive_id: null,
        archived_at: null,
        archive_revision: "0",
        viewer_context_revision: "1",
      })));
      return;
    }

    if (url.includes("/rest/v1/rpc/get_star_thread_snapshots_v1")) {
      await fulfillJson(route, requestedIds(request).map((postId) => ({
        post_id: postId,
        revision_epoch: REVISION_EPOCH,
        thread_revision: "1",
        viewer_revision: "0",
        viewer_context_revision: "1",
        letters: postId === OPENING_POST_ID ? [{
          id: STAR_LETTER_ID,
          post_id: OPENING_POST_ID,
          author_id: USER_ID,
          parent_star_letter_id: null,
          body: "Opening Memorialの小サイズ確認用星文",
          is_deleted: false,
          is_archived: false,
          total_resonance_count: 0,
          viewer_resonance_count: 0,
          created_at: "2026-08-14T03:10:00.000Z",
          updated_at: "2026-08-14T03:10:00.000Z",
          edited_at: null,
        }] : [],
      })));
      return;
    }

    if (url.includes("/rest/v1/rpc/get_archived_post_snapshots_v1")) {
      await fulfillJson(route, []);
      return;
    }

    if (url.includes("/rest/v1/posts")) {
      await fulfillJson(route, postRowsForUrl(url));
      return;
    }

    await fulfillJson(route, []);
  });
}

async function assertOverlayGeometry(frameImage, avatarSize, frameScale) {
  await expect(frameImage).toBeVisible();
  await expect.poll(
    () => frameImage.evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect.poll(
    () => frameImage.evaluate(
      (image) => image.parentElement?.querySelector(":scope > div > img")?.naturalWidth ?? 0,
    ),
  ).toBeGreaterThan(0);
  const geometry = await frameImage.evaluate((image) => {
    const root = image.parentElement;
    const avatar = root?.querySelector(":scope > div > img");
    const imageRect = image.getBoundingClientRect();
    const rootRect = root?.getBoundingClientRect();
    const avatarRect = avatar?.getBoundingClientRect();

    return {
      avatarHeight: avatarRect?.height ?? 0,
      avatarWidth: avatarRect?.width ?? 0,
      frameHeight: imageRect.height,
      frameWidth: imageRect.width,
      rootHeight: rootRect?.height ?? 0,
      rootWidth: rootRect?.width ?? 0,
    };
  });

  expect(geometry.rootWidth).toBeCloseTo(avatarSize, 1);
  expect(geometry.rootHeight).toBeCloseTo(avatarSize, 1);
  expect(geometry.avatarWidth).toBeCloseTo(avatarSize - 2, 1);
  expect(geometry.avatarHeight).toBeCloseTo(avatarSize - 2, 1);
  expect(geometry.frameWidth / geometry.rootWidth).toBeCloseTo(frameScale, 2);
  expect(geometry.frameHeight / geometry.rootHeight).toBeCloseTo(frameScale, 2);
}

async function captureVisual(target, fileName) {
  if (!screenshotDirectory) return;
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  await target.screenshot({
    path: path.join(screenshotDirectory, fileName),
  });
}

test("Opening Memorialは大・中・小avatarを縮めず外周へoverlayする", async ({ page }) => {
  await mockFramedVillage(page);
  await page.goto("/");

  const openingFrame = page.locator('img[src="/profile-frames/opening-memorial.png"]');
  const chiaFrame = page.locator('img[src="/profile-frames/chia-guide.png"]');

  await expect(page.getByText("Opening Memorialの通常サイズ確認用流星便")).toBeVisible();
  await assertOverlayGeometry(openingFrame.first(), 48, 1.15);
  await assertOverlayGeometry(chiaFrame.first(), 48, 1.22);

  const framelessPost = page.getByText("フレームなし表示の回帰確認用流星便").locator("xpath=ancestor::article[1]");
  await expect(framelessPost.locator('img[src*="/profile-frames/"]')).toHaveCount(0);
  const openingPost = page.getByText("Opening Memorialの通常サイズ確認用流星便").locator("xpath=ancestor::article[1]");
  await captureVisual(openingPost, "opening-memorial-medium-post.png");

  await page.getByRole("button", { name: "星文 1" }).first().click();
  await expect(page.getByText("Opening Memorialの小サイズ確認用星文")).toBeVisible();
  const starLetter = page.locator('article[aria-label="Opening Memorialテスターの星文"]');
  await assertOverlayGeometry(
    starLetter.locator('img[src="/profile-frames/opening-memorial.png"]'),
    36,
    1.15,
  );
  await page.getByText("Opening Memorialの小サイズ確認用星文").scrollIntoViewIfNeeded();
  await captureVisual(starLetter, "opening-memorial-small-star-letter.png");

  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "My Universe", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Opening Memorialテスター" })).toBeVisible();
  await assertOverlayGeometry(
    page.locator('img[src="/profile-frames/opening-memorial.png"]:visible').first(),
    64,
    1.15,
  );
  await captureVisual(page.locator("section.profile-surface").first(), "opening-memorial-large-profile.png");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
