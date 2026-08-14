import { defineConfig } from "@playwright/test";

const previewUrl = new URL(process.env.DEPLOY_PREVIEW_URL ?? "https://invalid.invalid");

if (
  previewUrl.protocol !== "https:" ||
  !/^deploy-preview-\d+--hoshizora-village[.]netlify[.]app$/.test(previewUrl.hostname)
) {
  throw new Error("DEPLOY_PREVIEW_URL must be a Hoshizora Village Deploy Preview URL");
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: previewUrl.origin,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
