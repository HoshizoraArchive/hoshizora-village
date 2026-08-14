import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const avatarFixture = fs.readFileSync(
  path.join(currentDir, "fixtures/opening-memorial-avatar.jpg"),
);

const NO1_ID = "11111111-1111-4111-8111-111111111111";
const NO10_ID = "10101010-1010-4010-8010-101010101010";
const CHIA_ID = "22222222-2222-4222-8222-222222222222";
const OPENING_FRAME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHIA_FRAME_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOUNDING_TITLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CHIA_TITLE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NO1_POST_ID = "44444444-4444-4444-8444-444444444444";
const NO10_POST_ID = "10101010-aaaa-4010-8010-101010101010";
const CHIA_POST_ID = "55555555-5555-4555-8555-555555555555";
const STAR_LETTER_ID = "77777777-7777-4777-8777-777777777777";
const REVISION_EPOCH = "88888888-8888-4888-8888-888888888888";
const AVATAR_FIXTURE_URL = "https://fixture.invalid/founding-resident-avatar.jpg";
const screenshotDirectory = process.env.FOUNDING_RESIDENT_SCREENSHOT_DIR
  ? path.resolve(process.cwd(), process.env.FOUNDING_RESIDENT_SCREENSHOT_DIR)
  : "";
const authStorageKeys = [
  "sb-127-auth-token",
  process.env.PROFILE_FRAME_AUTH_STORAGE_KEY,
].filter(Boolean);

function titleAssignment({ chia = false } = {}) {
  return {
    is_primary: true,
    granted_at: "2026-08-14T00:00:00.000Z",
    title: chia
      ? {
          id: CHIA_TITLE_ID,
          key: "celestial_guide",
          label: "街の案内人",
          description: "星空Villageを案内する星空ちあ専用の役職。",
          variant: "celestial_guide",
          emblem_path: "/assets/titles/chia-celestial-guide-emblem.png",
          is_active: true,
          sort_order: 10,
        }
      : {
          id: FOUNDING_TITLE_ID,
          key: "beta_tester",
          label: "古参村人",
          description: "開村初期の永久記念称号。",
          variant: "standard",
          emblem_path: null,
          is_active: true,
          sort_order: 100,
        },
  };
}

const profiles = [
  {
    id: NO1_ID,
    display_name: "Opening Memorial No.1",
    username: "founding_no1",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: "古参村人 No.1 の表示確認用プロフィールです。",
    constellation_note: null,
    active_frame_id: OPENING_FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
    profile_titles: [titleAssignment()],
    profile_cohorts: [
      {
        cohort_key: "beta_resident",
        serial_number: 1,
        joined_at: "2026-08-05T11:04:35.000Z",
      },
    ],
  },
  {
    id: NO10_ID,
    display_name: "Opening Memorial No.10",
    username: "founding_no10",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: "古参村人 No.10 の2桁表示確認用プロフィールです。",
    constellation_note: null,
    active_frame_id: OPENING_FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
    profile_titles: [titleAssignment()],
    profile_cohorts: [
      {
        cohort_key: "beta_resident",
        serial_number: 10,
        joined_at: "2026-08-14T00:00:00.000Z",
      },
    ],
  },
  {
    id: CHIA_ID,
    display_name: "星空ちあ",
    username: "chia_fixture",
    avatar_url: AVATAR_FIXTURE_URL,
    bio: "既存称号の回帰確認用プロフィールです。",
    constellation_note: null,
    active_frame_id: CHIA_FRAME_ID,
    notify_authors_when_i_archive: true,
    notify_authors_when_i_resonate: true,
    profile_titles: [titleAssignment({ chia: true })],
    profile_cohorts: [],
  },
];

const posts = [
  {
    id: NO1_POST_ID,
    author_id: NO1_ID,
    type: "text",
    body: "古参村人 No.1 の流星便表示確認",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T03:00:00.000Z",
  },
  {
    id: NO10_POST_ID,
    author_id: NO10_ID,
    type: "text",
    body: "古参村人 No.10 の流星便表示確認",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T02:30:00.000Z",
  },
  {
    id: CHIA_POST_ID,
    author_id: CHIA_ID,
    type: "text",
    body: "街の案内人の回帰確認",
    visibility: "public",
    deleted_at: null,
    created_at: "2026-08-14T02:00:00.000Z",
  },
];

function createUnsignedTestJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.test-signature`;
}

function createTestSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const user = {
    id: NO1_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "founding-resident@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };

  return {
    access_token: createUnsignedTestJwt({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: NO1_ID,
    }),
    expires_at: nowSeconds + 3_600,
    expires_in: 3_600,
    refresh_token: "founding-resident-refresh-token",
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
    return request.postDataJSON()?.p_post_ids ?? [];
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

async function mockVillage(page) {
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
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: avatarFixture });
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
          description: "星空ちあ専用フレーム",
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
      await fulfillJson(route, [
        { profile_id: NO1_ID, frame_id: OPENING_FRAME_ID, acquisition_source: "beta_resident" },
        { profile_id: NO10_ID, frame_id: OPENING_FRAME_ID, acquisition_source: "beta_resident" },
      ]);
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
        letters: postId === NO1_POST_ID ? [{
          id: STAR_LETTER_ID,
          post_id: NO1_POST_ID,
          author_id: NO1_ID,
          parent_star_letter_id: null,
          body: "古参村人 No.1 の星文表示確認",
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

async function removeNetlifyDrawer(page) {
  await page.locator('iframe[title="Netlify Drawer"]').evaluateAll((frames) => {
    for (const frame of frames) frame.remove();
  });
}

async function capture(page, fileName) {
  if (!screenshotDirectory) return;
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  await removeNetlifyDrawer(page);
  await page.screenshot({ path: path.join(screenshotDirectory, fileName) });
}

test("古参村人No.1/No.10と街の案内人を実コンポーネントで表示する", async ({ page }) => {
  await mockVillage(page);
  await page.goto("/");

  const no1Post = page.getByText("古参村人 No.1 の流星便表示確認").locator("xpath=ancestor::article[1]");
  const no10Post = page.getByText("古参村人 No.10 の流星便表示確認").locator("xpath=ancestor::article[1]");
  const chiaPost = page.getByText("街の案内人の回帰確認").locator("xpath=ancestor::article[1]");

  await expect(no1Post.getByText("古参村人 No.1", { exact: true })).toBeVisible();
  await expect(no10Post.getByText("古参村人 No.10", { exact: true })).toBeVisible();
  await expect(chiaPost.getByText("街の案内人", { exact: true })).toBeVisible();
  await expect(no1Post.locator('img[src="/profile-frames/opening-memorial.png"]')).toBeVisible();
  await expect(no10Post.locator('img[src="/profile-frames/opening-memorial.png"]')).toBeVisible();
  await expect(chiaPost.locator('img[src="/profile-frames/chia-guide.png"]')).toBeVisible();
  await capture(page, "founding-resident-stream-iphone.png");

  await page.getByRole("button", { name: "星文 1" }).first().click();
  const starLetter = page.locator('article[aria-label="Opening Memorial No.1の星文"]');
  await expect(starLetter.getByText("古参村人 No.1", { exact: true })).toBeVisible();
  await expect(starLetter.locator('img[src="/profile-frames/opening-memorial.png"]')).toBeVisible();
  await page.getByText("古参村人 No.1 の星文表示確認").scrollIntoViewIfNeeded();
  await capture(page, "founding-resident-star-letter-iphone.png");

  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "My Universe", exact: true })
    .click();
  const no1ProfileHeading = page.getByRole("heading", { name: "Opening Memorial No.1", exact: true });
  await expect(no1ProfileHeading).toBeVisible();
  const no1Profile = no1ProfileHeading.locator("xpath=ancestor::section[1]");
  await expect(no1Profile.getByText("古参村人 No.1", { exact: true })).toBeVisible();
  await expect(no1Profile.locator('img[src="/profile-frames/opening-memorial.png"]')).toBeVisible();
  await capture(page, "founding-resident-profile-no1-iphone.png");

  await page.goto("/stars/founding_no10");
  const no10ProfileHeading = page.getByRole("heading", { name: "Opening Memorial No.10", exact: true });
  await expect(no10ProfileHeading).toBeVisible();
  const no10Profile = no10ProfileHeading.locator("xpath=ancestor::section[1]");
  await expect(no10Profile.getByText("古参村人 No.10", { exact: true })).toBeVisible();
  await expect(no10Profile.locator('img[src="/profile-frames/opening-memorial.png"]')).toBeVisible();
  await capture(page, "founding-resident-profile-no10-iphone.png");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});