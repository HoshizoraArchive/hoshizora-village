import { expect, test } from "@playwright/test";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_USER_B_ID = "77777777-7777-4777-8777-777777777777";
const TEST_POST_ID = "22222222-2222-4222-8222-222222222222";
const TEST_POST_B_ID = "88888888-8888-4888-8888-888888888888";
const TEST_ARCHIVE_ID = "33333333-3333-4333-8333-333333333333";
const TEST_REVISION_EPOCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createSession({
  createdAt = "2026-08-04T00:00:00.000Z",
  email = "refresh-race@example.com",
  userId = TEST_USER_ID,
} = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: createdAt,
    updated_at: "2026-08-04T00:00:00.000Z",
  };

  return {
    access_token: `${encode({ alg: "none", typ: "JWT" })}.${encode({
      aud: "authenticated",
      exp: nowSeconds + 3_600,
      sub: userId,
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

function createPostSnapshot(controls, overrides = {}) {
  const deleted = overrides.deleted ?? controls.postDeleted;

  return {
    ...createPost(overrides.body ?? controls.postBody),
    post_id: TEST_POST_ID,
    available: !deleted,
    tombstoned: Boolean(deleted),
    body: deleted ? null : overrides.body ?? controls.postBody,
    deleted_at: deleted ? "2026-08-04T00:10:00.000Z" : null,
    revision_epoch: TEST_REVISION_EPOCH,
    content_revision: String(overrides.contentRevision ?? controls.contentRevision),
    assets_revision: String(overrides.assetsRevision ?? controls.assetsRevision),
    viewer_context_revision: String(overrides.viewerContextRevision ?? controls.viewerContextRevision),
    media_rows: overrides.mediaRows ?? controls.mediaRows,
    tag_rows: overrides.tagRows ?? controls.tagRows,
  };
}

function createEngagementSnapshot(controls, overrides = {}) {
  return {
    post_id: TEST_POST_ID,
    revision_epoch: TEST_REVISION_EPOCH,
    resonance_count: overrides.resonanceCount ?? controls.resonanceCount,
    viewer_resonance_count:
      overrides.viewerResonanceCount ?? controls.viewerResonanceCount ?? controls.resonanceCount,
    resonance_revision: String(overrides.resonanceRevision ?? controls.resonanceRevision),
    is_archived: overrides.archivePresent ?? controls.archivePresent,
    archive_id: (overrides.archivePresent ?? controls.archivePresent) ? TEST_ARCHIVE_ID : null,
    archived_at: (overrides.archivePresent ?? controls.archivePresent)
      ? "2026-08-04T00:01:00.000Z"
      : null,
    archive_revision: String(overrides.archiveRevision ?? controls.archiveRevision),
    viewer_context_revision: String(overrides.viewerContextRevision ?? controls.viewerContextRevision),
  };
}

function createThreadSnapshot(controls, overrides = {}) {
  return {
    post_id: TEST_POST_ID,
    revision_epoch: TEST_REVISION_EPOCH,
    thread_revision: String(overrides.threadRevision ?? controls.threadRevision),
    viewer_revision: String(overrides.viewerRevision ?? controls.viewerRevision),
    viewer_context_revision: String(controls.viewerContextRevision),
    letters: structuredClone(overrides.threadLetters ?? controls.threadLetters),
  };
}

function createProfile({
  displayName = "整合性テスター",
  emailUserId = TEST_USER_ID,
  username = "consistency_tester",
} = {}) {
  return {
    id: emailUserId,
    display_name: displayName,
    username,
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
  const loginSession = createSession({
    createdAt: "2026-01-01T00:00:00.000Z",
    email: "refresh-race-b@example.com",
    userId: TEST_USER_B_ID,
  });
  const controls = Object.assign(
    {
      archivePresent: true,
      archiveRevision: 1,
      archiveRefreshPhase: false,
      assetsRevision: 1,
      contentRevision: 1,
      delayArchiveMutation: false,
      delayedArchiveReads: 0,
      delayedArchiveMutations: 0,
      delayedPostSnapshots: 0,
      delayedResonanceReads: 0,
      discoveredResonanceCount: null,
      delayArchiveReads: false,
      delayGlobalStarLetters: false,
      delayResonanceReads: false,
      delayResonanceMutation: false,
      failResonanceReads: false,
      failMediaSigning: false,
      failStarThreadReads: false,
      failTagRelationReads: false,
      failTimelinePosts: false,
      extraPosts: [],
      globalStarLetterRefreshes: 0,
      hangNextPostSnapshot: false,
      hungPostSnapshots: 0,
      mediaRows: [],
      meteorTagRow: null,
      omitOwnPostDiscovery: false,
      nextEngagementSnapshot: null,
      postBody: "再同期race確認用の流星便",
      postDeleted: false,
      resonanceCount: 5,
      resonanceRevision: 1,
      resonanceReadAttempts: 0,
      pendingResonanceMutations: 0,
      resonanceMutationResponseCount: null,
      resonanceMutationResponseViewerContext: null,
      snapshotOnlyPosts: [],
      tagRows: [],
      tagRelationReadAttempts: 0,
      threadLetters: [createThreadLetter()],
      threadRevision: 1,
      timelinePhase: false,
      timelineRefreshReads: 0,
      timelineReads: 0,
      viewerContextRevision: 1,
      viewerRevision: 1,
      viewerResonanceCount: null,
    },
    overrides,
  );
  controls.activeSession = session;
  controls.loginSession = loginSession;

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

    if (url.includes("/auth/v1/logout")) {
      controls.activeSession = null;
      await fulfillJson(route, {});
      return;
    }

    if (url.includes("/auth/v1/user")) {
      await fulfillJson(
        route,
        controls.activeSession?.user ?? { message: "not authenticated" },
        controls.activeSession ? 200 : 401,
      );
      return;
    }

    if (url.includes("/auth/v1/token")) {
      if (url.includes("grant_type=password")) {
        controls.activeSession = controls.loginSession;
      }
      await fulfillJson(route, controls.activeSession ?? { message: "not authenticated" }, controls.activeSession ? 200 : 401);
      return;
    }

    if (url.includes("/storage/v1/object/sign/")) {
      if (controls.failMediaSigning) {
        await fulfillJson(route, { message: "media signing failed" }, 500);
      } else {
        await fulfillJson(route, { signedURL: "/object/sign/meteor-media/e2e.webp?token=e2e" });
      }
      return;
    }

    if (url.includes("/rest/v1/rpc/get_post_snapshots_v1")) {
      let snapshot = createPostSnapshot(controls);
      const requestedPostIds = request.postDataJSON()?.p_post_ids ?? [TEST_POST_ID];

      if (controls.timelinePhase) {
        controls.timelineRefreshReads += 1;

        if (controls.hangNextPostSnapshot) {
          controls.hangNextPostSnapshot = false;
          controls.hungPostSnapshots += 1;
          snapshot = createPostSnapshot(controls, {
            body: controls.firstTimelineBody,
            contentRevision: controls.firstTimelineRevision ?? controls.contentRevision,
          });
          await new Promise((resolve) => {
            controls.releaseHungPostSnapshot = resolve;
          });
        } else if (controls.timelineRefreshReads === 1 && controls.delayFirstTimelineRefresh) {
          snapshot = createPostSnapshot(controls, {
            body: controls.firstTimelineBody,
            contentRevision: controls.firstTimelineRevision ?? controls.contentRevision,
          });
          controls.delayedPostSnapshots += 1;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        } else if (controls.latestTimelineBody) {
          snapshot = createPostSnapshot(controls, {
            body: controls.latestTimelineBody,
            contentRevision: controls.latestTimelineRevision ?? controls.contentRevision,
          });
        }
      }

      const snapshots = requestedPostIds
        .map((postId) => {
          if (postId === TEST_POST_ID) {
            return snapshot;
          }

          const extraPost = [...controls.extraPosts, ...controls.snapshotOnlyPosts]
            .find((post) => post.id === postId);
          return extraPost
            ? {
                ...extraPost,
                post_id: extraPost.id,
                available: true,
                tombstoned: false,
                deleted_at: null,
                revision_epoch: TEST_REVISION_EPOCH,
                content_revision: String(extraPost.content_revision ?? 1),
                assets_revision: String(extraPost.assets_revision ?? 1),
                viewer_context_revision: String(controls.viewerContextRevision),
                media_rows: [],
                tag_rows: [],
              }
            : null;
        })
        .filter(Boolean);
      await fulfillJson(route, snapshots);
      return;
    }

    if (url.includes("/rest/v1/rpc/get_post_engagement_snapshots_v1")) {
      controls.resonanceReadAttempts += 1;
      const snapshot = createEngagementSnapshot(
        controls,
        controls.nextEngagementSnapshot ?? {},
      );
      controls.nextEngagementSnapshot = null;

      if (controls.delayResonanceReads) {
        controls.delayedResonanceReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      if (controls.failResonanceReads) {
        await fulfillJson(route, { code: "RES_READ_FAILED", message: "resonance read failed" }, 500);
        return;
      }

      await fulfillJson(route, [snapshot]);
      return;
    }

    if (url.includes("/rest/v1/rpc/get_star_thread_snapshots_v1")) {
      const snapshot = createThreadSnapshot(controls);

      if (controls.delayGlobalStarLetters) {
        controls.globalStarLetterRefreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      if (controls.failStarThreadReads) {
        await fulfillJson(route, { code: "STAR_READ_FAILED", message: "star read failed" }, 500);
        return;
      }

      await fulfillJson(route, [snapshot]);
      return;
    }

    if (url.includes("/rest/v1/rpc/get_archived_post_snapshots_v1")) {
      const snapshot = {
        ...createPostSnapshot(controls),
        ...createEngagementSnapshot(controls),
      };

      if (controls.delayArchiveReads && controls.archiveRefreshPhase) {
        controls.delayedArchiveReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await fulfillJson(route, controls.archivePresent ? [snapshot] : []);
      return;
    }

    if (url.includes("/rest/v1/rpc/add_post_resonance_v1")) {
      controls.resonanceCount += 1;
      controls.resonanceRevision += 1;
      const response = createEngagementSnapshot(controls, {
        resonanceCount: controls.resonanceMutationResponseCount ?? controls.resonanceCount,
        viewerContextRevision:
          controls.resonanceMutationResponseViewerContext ?? controls.viewerContextRevision,
      });
      response.outcome = "created";

      if (controls.delayResonanceMutation) {
        controls.pendingResonanceMutations += 1;
        await new Promise((resolve) => {
          controls.releaseResonanceMutation = resolve;
        });
      }

      await fulfillJson(route, response);
      return;
    }

    if (url.includes("/rest/v1/rpc/set_post_archive_v1")) {
      const archived = Boolean(request.postDataJSON()?.p_archived);
      controls.archivePresent = archived;
      controls.archiveRevision += 1;
      const response = {
        ...createPostSnapshot(controls),
        ...createEngagementSnapshot(controls),
        outcome: archived ? "archived" : "unarchived",
      };

      if (controls.delayArchiveMutation) {
        controls.delayedArchiveMutations += 1;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      await fulfillJson(route, response);
      return;
    }

    if (url.includes("/rest/v1/rpc/create_star_letter_v2")) {
      const submittedLetter = {
        ...createThreadLetter(),
        body: request.postDataJSON()?.p_body ?? createThreadLetter().body,
      };
      controls.threadLetters = [submittedLetter, ...controls.threadLetters.filter((item) => item.id !== submittedLetter.id)];
      controls.threadRevision += 1;
      await fulfillJson(route, {
        outcome: "created",
        post_id: TEST_POST_ID,
        star_letter_id: submittedLetter.id,
        letter: submittedLetter,
        removed: false,
        revision_epoch: TEST_REVISION_EPOCH,
        thread_revision: String(controls.threadRevision),
        viewer_revision: String(controls.viewerRevision),
        viewer_context_revision: String(controls.viewerContextRevision),
      });
      return;
    }

    if (url.includes("/rest/v1/rpc/update_post_v1")) {
      controls.postBody = request.postDataJSON()?.p_body ?? controls.postBody;
      controls.contentRevision += 1;
      controls.assetsRevision += 1;
      await fulfillJson(route, createPostSnapshot(controls));
      return;
    }

    if (url.includes("/rest/v1/rpc/delete_post_v1")) {
      controls.postDeleted = true;
      controls.contentRevision += 1;
      await fulfillJson(route, createPostSnapshot(controls));
      return;
    }

    if (url.includes("/rest/v1/rpc/replace_post_tags_v1")) {
      controls.assetsRevision += 1;
      await fulfillJson(route, {
        post_id: TEST_POST_ID,
        revision_epoch: TEST_REVISION_EPOCH,
        assets_revision: String(controls.assetsRevision),
        viewer_context_revision: String(controls.viewerContextRevision),
      });
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
      const responseCount = controls.discoveredResonanceCount ?? controls.resonanceCount;

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

    if (url.includes("/rest/v1/post_meteor_tags")) {
      controls.tagRelationReadAttempts += 1;
      if (controls.failTagRelationReads) {
        await fulfillJson(route, { code: "TAG_RELATION_READ_FAILED", message: "tag relation read failed" }, 500);
        return;
      }

      await fulfillJson(route, controls.meteorTagRow
        ? [{ post_id: TEST_POST_ID, sort_order: 0 }]
        : []);
      return;
    }

    if (url.includes("/rest/v1/meteor_tags")) {
      const accept = request.headers().accept || "";
      const body = controls.meteorTagRow
        ? controls.meteorTagRow
        : null;
      await fulfillJson(route, accept.includes("application/vnd.pgrst.object") ? body : body ? [body] : []);
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
      const isOwnPostsRequest = url.includes("author_id=eq.");

      if (isTimelineRequest) {
        controls.timelineReads += 1;

        if (controls.failTimelinePosts) {
          await fulfillJson(route, { code: "POST_READ_FAILED", message: "post read failed" }, 500);
          return;
        }
      }

      await fulfillJson(route, [
        ...(controls.postDeleted || (isOwnPostsRequest && controls.omitOwnPostDiscovery)
          ? []
          : [createPost(controls.postBody)]),
        ...controls.extraPosts,
      ]);
      return;
    }

    if (url.includes("/rest/v1/profiles")) {
      const profile = url.includes(TEST_USER_B_ID)
        ? createProfile({
            displayName: "Bユーザー",
            emailUserId: TEST_USER_B_ID,
            username: "consistency_b",
          })
        : createProfile();
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

test("Archive INSERT待ち中の共鳴0→1をArchive完了後も両viewで保持する", async ({ page }) => {
  const controls = await mockVillage(page, {
    archivePresent: false,
    archiveRevision: 0,
    delayArchiveMutation: true,
    resonanceCount: 0,
  });
  await page.goto("/");
  const card = page.getByRole("link", { name: "整合性テスターの流星便を開く" }).first();
  await expect(card).toBeVisible();

  await card.locator("button").filter({ hasText: "Archive" }).first().click();
  await expect.poll(() => controls.delayedArchiveMutations).toBeGreaterThan(0);
  await card.locator("button").filter({ hasText: "0 共鳴" }).first().click();
  await expectResonanceCount(page, 1);
  await expect(card.locator("button").filter({ hasText: "Archive済み" }).first()).toBeVisible();

  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expectResonanceCount(page, 1);
});

test("Archive待ち中にpostを編集してもArchiveは新本文を使う", async ({ page }) => {
  const controls = await mockVillage(page, {
    archivePresent: false,
    archiveRevision: 0,
    delayArchiveMutation: true,
    postBody: "編集前の本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  const card = page.getByRole("link", { name: "整合性テスターの流星便を開く" }).first();
  await card.locator("button").filter({ hasText: "Archive" }).first().click();
  await expect.poll(() => controls.delayedArchiveMutations).toBeGreaterThan(0);

  await card.locator("button").filter({ hasText: "編集" }).last().click();
  await card.getByPlaceholder("流星便の本文を編集する").fill("編集後の新しい本文");
  await card.locator("button[type='submit']").filter({ hasText: "保存" }).click();
  await expect(card.getByPlaceholder("流星便の本文を編集する")).toHaveCount(0);
  await expect(card.getByText("編集後の新しい本文", { exact: true })).toBeVisible();
  await expect(card.locator("button").filter({ hasText: "Archive済み" }).first()).toBeVisible();

  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.getByText("編集後の新しい本文")).toBeVisible();
  await expect(page.getByText("編集前の本文")).toHaveCount(0);
});

test("Archive待ち中にpostを削除しても古いArchive応答で復活しない", async ({ page }) => {
  const controls = await mockVillage(page, {
    archivePresent: false,
    archiveRevision: 0,
    delayArchiveMutation: true,
    postBody: "削除対象の本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  const card = page.getByRole("link", { name: "整合性テスターの流星便を開く" }).first();
  await card.locator("button").filter({ hasText: "Archive" }).first().click();
  await expect.poll(() => controls.delayedArchiveMutations).toBeGreaterThan(0);
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("button").filter({ hasText: "削除" }).last().click();
  await expect(page.getByText("削除対象の本文")).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByText("削除対象の本文")).toHaveCount(0);

  await page.getByRole("navigation", { name: "星空Village bottom navigation" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.getByText("削除対象の本文")).toHaveCount(0);
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

test("共鳴mutationのviewer contextが古くても新しいviewer projectionを壊さない", async ({ page }) => {
  const controls = await mockVillage(page, {
    resonanceCount: 5,
    resonanceMutationResponseCount: 99,
    resonanceMutationResponseViewerContext: 1,
    viewerContextRevision: 2,
  });
  await page.goto("/");
  await expectResonanceCount(page, 5);

  controls.failResonanceReads = true;
  await page.getByRole("button", { name: /5 共鳴$/ }).first().click();
  await expectResonanceCount(page, 6);
  await expect(page.getByRole("button", { name: /99 共鳴$/ })).toHaveCount(0);
});

test("mutation後に開始したGETでも古いrevisionは拒否し真の新しい0は受理する", async ({ page }) => {
  const controls = await mockVillage(page, {
    resonanceCount: 0,
    resonanceRevision: 1,
  });
  await page.goto("/");
  await page.getByRole("button", { name: /0 共鳴$/ }).first().click();
  await expectResonanceCount(page, 1);

  controls.nextEngagementSnapshot = {
    resonanceCount: 0,
    resonanceRevision: 1,
  };
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 1);

  controls.resonanceCount = 0;
  controls.resonanceRevision = 3;
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 0);
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

test("星文POST成功後の再取得500でも保存済み星文を画面に残す", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 0, threadLetters: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "星文 0" }).first().click();
  controls.failStarThreadReads = true;
  await page.getByPlaceholder("この流星便に星文を残す").fill("保存済みで再同期だけ失敗する星文");
  await page.getByRole("button", { name: "星文を送る" }).click();

  await expect(page.getByText("保存済みで再同期だけ失敗する星文")).toBeVisible();
  await expect(page.getByRole("button", { name: "星文 1" }).first()).toBeVisible();
  await expect(page.getByText(/保存済みですが、再同期に失敗しました/).first()).toBeVisible();
});

test("rich星文projectionをglobal再取得してもaggregateとviewer stateを失わない", async ({ page }) => {
  const richLetter = {
    ...createThreadLetter(),
    is_archived: true,
    total_resonance_count: 4,
    viewer_resonance_count: 2,
  };
  await mockVillage(page, { resonanceCount: 0, threadLetters: [richLetter] });
  await page.goto("/");
  await page.getByRole("button", { name: "星文 1" }).first().click();
  const letter = page.getByRole("article", { name: "整合性テスターの星文" });
  await expect(letter.getByRole("button", { name: "共鳴 4 · あなた 2" })).toBeVisible();
  await expect(letter.getByRole("button", { name: "Archive解除" })).toBeVisible();

  await triggerForegroundRefresh(page);
  await expect(letter.getByRole("button", { name: "共鳴 4 · あなた 2" })).toBeVisible();
  await expect(letter.getByRole("button", { name: "Archive解除" })).toBeVisible();
});

test("media署名取得失敗時も既存media projectionを消さない", async ({ page }) => {
  const controls = await mockVillage(page, {
    mediaRows: [{
      id: "66666666-6666-4666-8666-666666666666",
      post_id: TEST_POST_ID,
      uploader_id: TEST_USER_ID,
      media_type: "image",
      storage_path: `${TEST_USER_ID}/e2e.webp`,
      thumbnail_storage_path: null,
      duration_seconds: null,
      sort_order: 0,
      mime_type: "image/webp",
      size_bytes: 100,
      created_at: "2026-08-04T00:00:00.000Z",
    }],
    resonanceCount: 0,
  });
  await page.goto("/");
  const mediaButton = page.getByRole("button", { name: "流星便の星影 1 / 1 を開く" }).first();
  await expect(mediaButton).toBeVisible();

  controls.failMediaSigning = true;
  controls.assetsRevision += 1;
  await triggerObservePullRefresh(page);
  await expect(mediaButton).toBeVisible();
});

test("tag relation取得失敗時も既存tag viewのpostを消さない", async ({ page }) => {
  const tagRow = {
    id: "99999999-9999-4999-8999-999999999999",
    name: "race-tag",
    normalized_name: "race-tag",
    created_at: "2026-08-04T00:00:00.000Z",
  };
  const controls = await mockVillage(page, {
    meteorTagRow: tagRow,
    postBody: "tag取得失敗でも残る本文",
    resonanceCount: 0,
    tagRows: [{
      post_id: TEST_POST_ID,
      sort_order: 0,
      meteor_tags: tagRow,
    }],
  });
  await page.goto("/tags/race-tag");
  await expect(page.getByText("tag取得失敗でも残る本文", { exact: true })).toBeVisible();

  const readsBeforeFailure = controls.tagRelationReadAttempts;
  controls.failTagRelationReads = true;
  await triggerForegroundRefresh(page);
  await expect.poll(() => controls.tagRelationReadAttempts).toBeGreaterThan(readsBeforeFailure);
  await expect(page.getByText("tag取得失敗でも残る本文", { exact: true })).toBeVisible();
});

test("Aユーザーの星文draftをlogout後のBユーザーへ引き継がない", async ({ page }) => {
  await mockVillage(page, { resonanceCount: 0, threadLetters: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "星文 0" }).first().click();
  await page.getByPlaceholder("この流星便に星文を残す").fill("Aユーザーだけの未送信draft");

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "村へ帰る", exact: true })).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill("refresh-race-b@example.com");
  await page.getByPlaceholder("6文字以上").fill("password-b");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bユーザー", exact: true })).toBeVisible();

  await navigation.getByRole("button", { name: "観測", exact: true }).click();
  await page.getByRole("button", { name: "星文 0" }).first().click();
  await expect(page.getByPlaceholder("この流星便に星文を残す")).toHaveValue("");
  await expect(page.getByText("Aユーザーだけの未送信draft")).toHaveCount(0);
});

test("session切替中に完了したAの旧requestをBのstateへ適用しない", async ({ page }) => {
  const controls = await mockVillage(page, {
    delayFirstTimelineRefresh: true,
    firstTimelineBody: "A sessionの遅延snapshot",
    firstTimelineRevision: 10,
    latestTimelineBody: "B sessionの現在snapshot",
    latestTimelineRevision: 1,
    postBody: "切替前の本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  controls.timelinePhase = true;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.delayedPostSnapshots).toBeGreaterThan(0);

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  await page.getByPlaceholder("you@example.com").fill("refresh-race-b@example.com");
  await page.getByPlaceholder("6文字以上").fill("password-b");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bユーザー", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "観測", exact: true }).click();

  await expect(page.getByText("B sessionの現在snapshot")).toBeVisible();
  await page.waitForTimeout(1_100);
  await expect(page.getByText("B sessionの現在snapshot")).toBeVisible();
  await expect(page.getByText("A sessionの遅延snapshot")).toHaveCount(0);
});

test("session切替中に完了したAのmutation結果をBのstateへ適用しない", async ({ page }) => {
  const controls = await mockVillage(page, {
    delayResonanceMutation: true,
    resonanceCount: 0,
    resonanceMutationResponseCount: 99,
  });
  await page.goto("/");
  await page.getByRole("button", { name: /0 共鳴$/ }).first().click();
  await expect.poll(() => controls.pendingResonanceMutations).toBe(1);

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  await page.getByPlaceholder("you@example.com").fill("refresh-race-b@example.com");
  await page.getByPlaceholder("6文字以上").fill("password-b");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bユーザー", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "観測", exact: true }).click();
  await expectResonanceCount(page, 1);

  controls.releaseResonanceMutation();
  await page.waitForTimeout(300);
  await expectResonanceCount(page, 1);
  await expect(page.getByRole("button", { name: /99 共鳴$/ })).toHaveCount(0);
});

test("A更新と競合したtimelineでもstale Aだけを拒否して新規Bを取り込む", async ({ page }) => {
  const controls = await mockVillage(page, {
    delayFirstTimelineRefresh: true,
    firstTimelineBody: "Aの古い本文",
    firstTimelineRevision: 1,
    postBody: "Aの更新前本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  controls.extraPosts = [{
    id: TEST_POST_B_ID,
    author_id: TEST_USER_ID,
    type: "text",
    body: "競合中に届いた新規B",
    visibility: "public",
    created_at: "2026-08-04T00:05:00.000Z",
  }];
  controls.timelinePhase = true;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.delayedPostSnapshots).toBeGreaterThan(0);

  const cardA = page.locator("article.post-card", { hasText: "Aの更新前本文" });
  await cardA.locator("button").filter({ hasText: "編集" }).last().click();
  const editor = page.getByPlaceholder("流星便の本文を編集する");
  await editor.fill("Aのmutation成功本文");
  await editor.locator("xpath=ancestor::form").locator("button[type='submit']").filter({ hasText: "保存" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Aのmutation成功本文", { exact: true })).toBeVisible();
  await expect(page.getByText("競合中に届いた新規B")).toBeVisible();
  await page.waitForTimeout(1_100);

  await expect(page.getByText("Aのmutation成功本文")).toBeVisible();
  await expect(page.getByText("Aの古い本文")).toHaveCount(0);
  await expect(page.getByText("競合中に届いた新規B")).toBeVisible();
});

test("stale timeline一覧が既知の新規postを欠落してもentity snapshotで保持する", async ({ page }) => {
  const postB = {
    id: TEST_POST_B_ID,
    author_id: TEST_USER_ID,
    type: "text",
    body: "stale一覧から欠落した新規B",
    visibility: "public",
    created_at: "2026-08-04T00:05:00.000Z",
  };
  const controls = await mockVillage(page, {
    extraPosts: [postB],
    resonanceCount: 0,
  });
  await page.goto("/");
  await expect(page.getByText(postB.body)).toBeVisible();

  controls.extraPosts = [];
  controls.snapshotOnlyPosts = [postB];
  await triggerObservePullRefresh(page);

  await expect(page.getByText(postB.body)).toBeVisible();
});

test("stale own・resonated一覧が既知postを欠落してもrevision snapshotで保持する", async ({ page }) => {
  const controls = await mockVillage(page, {
    resonanceCount: 1,
    viewerResonanceCount: 1,
  });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^流星便 1$/ })).toBeVisible();
  await expect(page.getByText("再同期race確認用の流星便")).toBeVisible();

  controls.omitOwnPostDiscovery = true;
  controls.discoveredResonanceCount = 0;
  await triggerForegroundRefresh(page);

  await expect(page.getByRole("tab", { name: /^流星便 1$/ })).toBeVisible();
  await page.getByRole("tab", { name: /^共鳴 1$/ }).click();
  await expect(page.getByText("再同期race確認用の流星便")).toBeVisible();
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
  await expect.poll(() => controls.delayedPostSnapshots).toBeGreaterThan(0);
  const readsBeforeForeground = controls.timelineRefreshReads;
  await triggerForegroundRefresh(page);

  await expect.poll(() => controls.timelineRefreshReads).toBeGreaterThan(readsBeforeForeground);
  await expect(page.getByText("後発更新の最新本文")).toBeVisible();
  await expect(page.getByText("先行更新の古い本文")).toHaveCount(0);
});

test("hung refreshをforegroundが追い越して最新refreshを最終実行する", async ({ page }) => {
  const controls = await mockVillage(page, {
    firstTimelineBody: "応答しない古いsnapshot",
    firstTimelineRevision: 1,
    latestTimelineBody: "hungを追い越した最新snapshot",
    latestTimelineRevision: 2,
    postBody: "hung開始前の本文",
    resonanceCount: 0,
  });
  await page.goto("/");
  controls.timelinePhase = true;
  controls.hangNextPostSnapshot = true;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.hungPostSnapshots).toBe(1);

  await triggerForegroundRefresh(page);
  await expect(page.getByText("hungを追い越した最新snapshot")).toBeVisible();
  await expect(page.getByText("応答しない古いsnapshot")).toHaveCount(0);
  controls.releaseHungPostSnapshot?.();
});

test("増減・真の0・取得失敗を収束させ同一postを全viewで一致させる", async ({ page }) => {
  const controls = await mockVillage(page, { resonanceCount: 5 });
  await page.goto("/");
  await expectResonanceCount(page, 5);

  controls.delayResonanceReads = true;
  controls.resonanceCount = 2;
  controls.resonanceRevision += 1;
  await triggerObservePullRefresh(page);
  await expect.poll(() => controls.delayedResonanceReads).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  await expectResonanceCount(page, 5);
  await expect(page.getByRole("button", { name: /0 共鳴$/ })).toHaveCount(0);
  await expectResonanceCount(page, 2);
  controls.delayResonanceReads = false;

  controls.resonanceCount = 0;
  controls.resonanceRevision += 1;
  await triggerObservePullRefresh(page);
  await expectResonanceCount(page, 0);

  controls.resonanceCount = 4;
  controls.resonanceRevision += 1;
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
  controls.resonanceRevision += 1;
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
