const DEPLOY_PREVIEW_CONTEXT = "deploy-preview";
const PREVIEW_PROJECT_REF = "qskeezefmvnutuzpevbc";
const PRODUCTION_PROJECT_REF = "dhfecpymvmursozfgjlr";
import { pathToFileURL } from "node:url";

const PREVIEW_SUPABASE_HOST = `${PREVIEW_PROJECT_REF}.supabase.co`;
const PREVIEW_SUPABASE_URL = `https://${PREVIEW_SUPABASE_HOST}`;

function fail(message) {
  throw new Error(`deploy_preview_env_guard: ${message}`);
}

export function validateDeployPreviewEnv(env = process.env) {
  if (env.CONTEXT !== DEPLOY_PREVIEW_CONTEXT) {
    return;
  }

  const browserUrl = String(env.VITE_SUPABASE_URL ?? "").trim();
  const functionUrl = String(env.SUPABASE_URL ?? "").trim();

  if (!browserUrl) {
    fail("VITE_SUPABASE_URL is required");
  }

  if (!functionUrl) {
    fail("SUPABASE_URL is required");
  }

  if (browserUrl !== functionUrl) {
    fail("VITE_SUPABASE_URL and SUPABASE_URL must match");
  }

  if (browserUrl.includes(PRODUCTION_PROJECT_REF)) {
    fail("Production Supabase is forbidden in deploy-preview");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(browserUrl);
  } catch {
    fail("Supabase URL is invalid");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== PREVIEW_SUPABASE_HOST ||
    parsedUrl.origin !== PREVIEW_SUPABASE_URL ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    fail(`Supabase host must be ${PREVIEW_SUPABASE_HOST}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateDeployPreviewEnv();
}
