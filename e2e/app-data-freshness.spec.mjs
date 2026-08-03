import { expect, test } from "@playwright/test";

async function mockEmptyVillage(page, counters) {
  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (request.url().includes("/rest/v1/posts")) {
      counters.postReads += 1;
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
}

test("観測欄の既存更新が完了したらAppをsoft remountして全読込系を再実行する", async ({ page }) => {
  const counters = { postReads: 0 };
  await mockEmptyVillage(page, counters);
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "星空Village bottom navigation" })).toBeVisible();
  await expect.poll(() => counters.postReads).toBeGreaterThan(0);
  const initialPostReads = counters.postReads;
  let unexpectedNavigations = 0;

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      unexpectedNavigations += 1;
    }
  });

  await page.evaluate(() => {
    const status = document.createElement("p");
    status.className = "observe-timeline-refresh-status";
    status.textContent = "✦ 流星便を観測中…";
    document.body.appendChild(status);
    window.setTimeout(() => status.remove(), 40);
  });

  await expect.poll(() => counters.postReads).toBeGreaterThan(initialPostReads);
  expect(unexpectedNavigations).toBe(0);
  await expect(
    page.getByRole("navigation", { name: "星空Village bottom navigation" }).getByRole("button", {
      name: "観測",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
});

test("PWA復帰相当のpagehide→focusでもブラウザreloadせず最新データを読み直す", async ({ page }) => {
  const counters = { postReads: 0 };
  await mockEmptyVillage(page, counters);
  await page.goto("/");

  await expect.poll(() => counters.postReads).toBeGreaterThan(0);
  const initialPostReads = counters.postReads;
  let unexpectedNavigations = 0;

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      unexpectedNavigations += 1;
    }
  });

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(420);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect.poll(() => counters.postReads).toBeGreaterThan(initialPostReads);
  expect(unexpectedNavigations).toBe(0);
});

test("入力中はPWA復帰相当でもsoft remountせず入力内容を守る", async ({ page }) => {
  const counters = { postReads: 0 };
  await mockEmptyVillage(page, counters);
  await page.goto("/");

  await expect.poll(() => counters.postReads).toBeGreaterThan(0);
  const emailInput = page.getByLabel("メールアドレス");
  await emailInput.fill("draft@example.com");
  await emailInput.focus();
  const initialPostReads = counters.postReads;

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(420);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(350);

  await expect(emailInput).toHaveValue("draft@example.com");
  expect(counters.postReads).toBe(initialPostReads);
});
