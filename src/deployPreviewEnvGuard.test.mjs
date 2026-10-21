import assert from "node:assert/strict";
import test from "node:test";
import { validateDeployPreviewEnv } from "../scripts/validate-deploy-preview-env.mjs";

const PREVIEW_URL = "https://qskeezefmvnutuzpevbc.supabase.co";
const PRODUCTION_URL = "https://dhfecpymvmursozfgjlr.supabase.co";

test("does not constrain local or Production builds", () => {
  assert.doesNotThrow(() => validateDeployPreviewEnv({}));
  assert.doesNotThrow(() =>
    validateDeployPreviewEnv({
      CONTEXT: "production",
      VITE_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_URL: PRODUCTION_URL,
    }),
  );
});

test("accepts Preview-v2 for deploy-preview", () => {
  assert.doesNotThrow(() =>
    validateDeployPreviewEnv({
      CONTEXT: "deploy-preview",
      VITE_SUPABASE_URL: PREVIEW_URL,
      SUPABASE_URL: PREVIEW_URL,
    }),
  );
});

test("rejects missing or mismatched deploy-preview URLs", () => {
  assert.throws(
    () => validateDeployPreviewEnv({ CONTEXT: "deploy-preview" }),
    /VITE_SUPABASE_URL is required/,
  );
  assert.throws(
    () =>
      validateDeployPreviewEnv({
        CONTEXT: "deploy-preview",
        VITE_SUPABASE_URL: PREVIEW_URL,
      }),
    /SUPABASE_URL is required/,
  );
  assert.throws(
    () =>
      validateDeployPreviewEnv({
        CONTEXT: "deploy-preview",
        VITE_SUPABASE_URL: PREVIEW_URL,
        SUPABASE_URL: `${PREVIEW_URL}/`,
      }),
    /must match/,
  );
});

test("rejects Production and other Supabase projects in deploy-preview", () => {
  assert.throws(
    () =>
      validateDeployPreviewEnv({
        CONTEXT: "deploy-preview",
        VITE_SUPABASE_URL: PRODUCTION_URL,
        SUPABASE_URL: PRODUCTION_URL,
      }),
    /Production Supabase is forbidden/,
  );
  assert.throws(
    () =>
      validateDeployPreviewEnv({
        CONTEXT: "deploy-preview",
        VITE_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
        SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
      }),
    /Supabase host must be qskeezefmvnutuzpevbc\.supabase\.co/,
  );
});

test("accepts only Preview-v2 Supabase in branch-deploy", () => {
  assert.doesNotThrow(() => validateDeployPreviewEnv({
    CONTEXT: "branch-deploy",
    VITE_SUPABASE_URL: PREVIEW_URL,
    SUPABASE_URL: PREVIEW_URL,
  }));
});

test("rejects Production Supabase in branch-deploy", () => {
  assert.throws(() => validateDeployPreviewEnv({
    CONTEXT: "branch-deploy",
    VITE_SUPABASE_URL: PRODUCTION_URL,
    SUPABASE_URL: PRODUCTION_URL,
  }), /Production Supabase is forbidden/);
});

test("rejects mismatched and missing branch-deploy Supabase URLs", () => {
  assert.throws(() => validateDeployPreviewEnv({ CONTEXT: "branch-deploy" }), /VITE_SUPABASE_URL is required/);
  assert.throws(() => validateDeployPreviewEnv({
    CONTEXT: "branch-deploy",
    VITE_SUPABASE_URL: PREVIEW_URL,
    SUPABASE_URL: PRODUCTION_URL,
  }), /must match/);
  assert.throws(() => validateDeployPreviewEnv({
    CONTEXT: "branch-deploy",
    VITE_SUPABASE_URL: "https://nonpreview.supabase.co",
    SUPABASE_URL: "https://nonpreview.supabase.co",
  }), /Supabase host must be/);
});

test("other build contexts retain pre-existing behavior", () => {
  for (const context of ["production", "dev", "deploy-context", ""]) {
    assert.doesNotThrow(() => validateDeployPreviewEnv({
      CONTEXT: context,
      VITE_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_URL: PRODUCTION_URL,
    }));
  }
});
