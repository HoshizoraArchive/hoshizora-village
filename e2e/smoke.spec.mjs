import { expect, test } from "@playwright/test";

async function mockSupabaseAsEmptyVillage(page) {
  await page.route("**/__supabase/**", async (route) => {
    const request = route.request();

    if (request.method() === "OPTIONS") {
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
}

async function openVillageAsGuest(page) {
  await mockSupabaseAsEmptyVillage(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "星空Village" })).toBeVisible();
}

test.describe("星空Village browser smoke", () => {
  test("ゲスト状態でアプリとログインUIが起動する", async ({ page }) => {
    await openVillageAsGuest(page);

    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: "ログインする" })).toBeVisible();

    const navigation = page.getByRole("navigation", {
      name: "星空Village bottom navigation",
    });

    await expect(navigation).toBeVisible();

    for (const label of ["観測", "R.Connect", "流星便", "Archive", "My Universe"]) {
      await expect(navigation.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    await expect(
      navigation.getByRole("button", { name: "観測", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("主要5タブをスマホ幅で移動できる", async ({ page }) => {
    await openVillageAsGuest(page);

    const navigation = page.getByRole("navigation", {
      name: "星空Village bottom navigation",
    });

    for (const label of ["R.Connect", "流星便", "Archive", "My Universe", "観測"]) {
      const button = navigation.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-current", "page");
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );

    expect(hasHorizontalOverflow).toBe(false);
  });
});
