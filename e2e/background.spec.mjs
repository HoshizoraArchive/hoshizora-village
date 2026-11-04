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

test('desktop background displays the separately selected landscape artwork at PC width', async ({page, request}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.route('**/__supabase/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({status: 204, body: ''}); return;
    }
    await route.fulfill({status: 200, contentType:'application/json', headers:{'access-control-allow-origin':'*','content-range':'0-0/0'},body:'[]'});
  });
  await page.goto('/');
  const background = page.locator('.cosmic-background');
  await expect(background).toBeVisible();
  const css = await background.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(css).toContain('hoshizora-village-background-desktop.webp?v=20261105-desktop-source-verified');
  const response = await request.get('/images/hoshizora-village-background-desktop.webp');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/webp');
  const data = await response.body();
  expect(createHash('sha256').update(data).digest('hex')).toBe('24c1879889f506fe22ebc8e747cde955a7a5d88e99e85ca2c042db8922eb0b5d');
  const dimensions = await page.evaluate(src => new Promise((resolve,reject)=>{
    const img = new Image(); img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
    img.onerror=()=>reject(new Error('desktop background decode failed')); img.src=src;
  }), '/images/hoshizora-village-background-desktop.webp');
  expect(dimensions).toEqual({width:1536,height:864});
  await page.screenshot({path:'../../desktop-village-local-browser-20261105.png'});
});
