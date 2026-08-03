import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const BACKGROUND_PATH =
  "/images/hoshizora-village-background-current.webp?v=20260803-bg75-integrity";
const EXPECTED_BYTES = 118528;
const EXPECTED_SHA256 =
  "f737734ca6300ada09452be2926917d5ee8851ff7276add4d3fa439d3b8a75f7";

test("mobile background serves and renders the exact selected WebP", async ({
  page,
  request,
}) => {
  await page.route("**/__supabase/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
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

  await page.goto("/");

  const background = page.locator(".cosmic-background");
  await expect(background).toBeVisible();

  const backgroundImage = await background.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(backgroundImage).toContain(
    "hoshizora-village-background-current.webp?v=20260803-bg75-integrity",
  );

  const response = await request.get(BACKGROUND_PATH);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/webp");

  const body = await response.body();
  expect(body.length).toBe(EXPECTED_BYTES);
  expect(createHash("sha256").update(body).digest("hex")).toBe(EXPECTED_SHA256);

  const dimensions = await page.evaluate(
    (src) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Failed to decode ${src}`));
        image.src = src;
      }),
    BACKGROUND_PATH,
  );

  expect(dimensions).toEqual({ width: 864, height: 1536 });
});
