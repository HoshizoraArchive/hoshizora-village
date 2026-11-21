import { expect, test } from "@playwright/test";

test.use({
  ...(process.env.VILLAGE_E2E_CHROME === "1" ? { channel: "chrome" } : {}),
  video: "off",
  viewport: { width: 390, height: 844 },
});

async function mockVillage(page, { delayPosts = false, failPosts = false } = {}) {
  let releasePosts;
  const postGate = new Promise((resolve) => {
    releasePosts = resolve;
  });

  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const isPostRead = request.method() === "GET" && request.url().includes("/rest/v1/posts");
    if (isPostRead && delayPosts) await postGate;
    await route.fulfill({
      status: isPostRead && failPosts ? 500 : 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "content-range": "0-0/0",
      },
      body: isPostRead && failPosts ? JSON.stringify({ message: "test load failure" }) : "[]",
    });
  });
  return () => releasePosts();
}

async function installTestSession(page) {
  const userId = "11111111-1111-4111-8111-111111111111";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ aud: "authenticated", exp: expiry, sub: userId })}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "village-intro-test@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
  };
  await page.route("**/__supabase/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(user),
    });
  });
  await page.addInitScript(({ session }) => {
    window.localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, {
    session: {
      access_token: accessToken,
      expires_at: expiry,
      expires_in: 3600,
      refresh_token: "intro-test-refresh-token",
      token_type: "bearer",
      user,
    },
  });
}

test("mobile entry shimmers at center, then lands in the original header before revealing navigation", async ({ page }, testInfo) => {
  const releasePosts = await mockVillage(page, { delayPosts: true });
  await installTestSession(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const intro = page.locator("[data-observe-intro]");
  const flight = page.locator(".observe-brand-intro-flight");
  const headerLogo = page.locator(".observe-brand-header-logo");
  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });

  await expect(intro).toHaveAttribute("data-phase", "loading");
  await expect(flight).toBeVisible();
  const startY = await flight.evaluate((node) => node.getBoundingClientRect().top);
  await page.waitForTimeout(1250);
  await expect(intro).toHaveAttribute("data-phase", "loading");
  await expect(navigation).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("loading.png") });

  releasePosts();
  await expect(intro).toHaveAttribute("data-phase", "flying", { timeout: 7000 });
  await expect(intro).toBeHidden({ timeout: 7000 });
  await expect(headerLogo).toBeVisible();
  await expect(navigation).toBeVisible();

  const endY = await headerLogo.evaluate((node) => node.getBoundingClientRect().top);
  expect(endY).toBeLessThan(startY);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("finished.png") });

  await navigation.getByRole("button", { name: "Archive" }).click();
  await navigation.getByRole("button", { name: "観測" }).click();
  await expect(page.locator("[data-observe-intro]")).toHaveCount(0);
});

test("guest login never blocks the upward logo flight, even when posts stay pending", async ({ page }, testInfo) => {
  const releasePosts = await mockVillage(page, { delayPosts: true });
  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const intro = page.locator("[data-observe-intro]");
  const headerLogo = page.locator(".observe-brand-header-logo");
  const loginPanel = page.locator('[data-auth-panel="visible"]');
  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await expect(intro).toHaveAttribute("data-phase", "loading");
  const centerY = await page.locator(".observe-brand-intro-flight").evaluate((node) => node.getBoundingClientRect().top);
  await expect(loginPanel).toBeHidden();
  await expect(intro).toHaveAttribute("data-phase", "flying", { timeout: 3000 });
  await expect(loginPanel).toBeHidden();

  await expect(intro).toHaveCount(0, { timeout: 3500 });
  const completionMs = Date.now() - startedAt;
  expect(completionMs).toBeLessThan(3500);
  await expect(headerLogo).toBeVisible();
  await expect(loginPanel).toBeVisible();
  await expect(navigation).toBeVisible();

  const headerBottom = await page.locator(".observe-brand-header").evaluate((node) => node.getBoundingClientRect().bottom);
  const finalLogoY = await headerLogo.evaluate((node) => node.getBoundingClientRect().top);
  const loginTop = await loginPanel.evaluate((node) => node.getBoundingClientRect().top);
  expect(headerBottom).toBeLessThan(loginTop);
  expect(finalLogoY).toBeLessThan(centerY);
  expect(headerBottom).toBeLessThan(150);
  await page.screenshot({ path: testInfo.outputPath("guest-finished.png") });
  releasePosts();
});

test("failed public-post reads also return to the normal header and visible UI", async ({ page }) => {
  await mockVillage(page, { failPosts: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-observe-intro]")).toBeHidden({ timeout: 7000 });
  await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
  await expect(page.locator(".observe-brand-header-logo")).toBeVisible();
});

test("reduced-motion users skip the moving logo without hiding navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockVillage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-observe-intro]")).toHaveCount(0, { timeout: 2500 });
  await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
});
