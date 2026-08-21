import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  config as functionConfig,
  handleSignupOpen,
  validateSignupOpenPayload,
} from "../signup-open.mjs";

const initialMigrationSql = readFileSync(
  "supabase/migrations/20260809044223_add_signup_open_tracking.sql",
  "utf8",
);
const protectionMigrationSql = readFileSync(
  "supabase/migrations/20260821140747_protect_signup_open_rpc.sql",
  "utf8",
);
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const previewBaselineSql = readFileSync(
  "supabase/preview-baseline/20260809150000_add_signup_open_tracking.sql",
  "utf8",
);
const trackingSource = readFileSync("src/signupOpenTracking.js", "utf8");
const functionSource = readFileSync("netlify/functions/signup-open.mjs", "utf8");
const adminSource = readFileSync("src/SignupOpenAdminApp.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

const productionContext = {
  deploy: {
    context: "production",
    published: true,
  },
};

function createRequest(overrides = {}) {
  return new Request("https://hoshizora-village.netlify.app/api/signup-open", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      visitorId: "11111111-1111-4111-8111-111111111111",
      appMode: "browser",
      platform: "desktop",
      clientOpenedAt: "2026-08-21T12:00:00.000Z",
      ...overrides,
    }),
  });
}

function createDependencies(onRpc) {
  return {
    readEnv(name) {
      if (name === "SUPABASE_URL") {
        return "https://dhfecpymvmursozfgjlr.supabase.co";
      }

      if (name === "SUPABASE_SERVICE_ROLE_KEY") {
        return "unit-test-placeholder";
      }

      return "";
    },
    createClient() {
      return {
        rpc: onRpc,
      };
    },
  };
}

test("Production signup screen open records exactly one validated RPC call", async () => {
  const calls = [];
  const response = await handleSignupOpen(
    createRequest(),
    productionContext,
    createDependencies(async (name, payload) => {
      calls.push({ name, payload });
      return { error: null };
    }),
  );

  assert.equal(response.status, 204);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    name: "record_signup_open",
    payload: {
      p_visitor_id: "11111111-1111-4111-8111-111111111111",
      p_app_mode: "browser",
      p_platform: "desktop",
      p_client_opened_at: "2026-08-21T12:00:00.000Z",
    },
  });
});

test("managed rate limit is keyed by source IP and not by client visitor UUID", () => {
  assert.deepEqual(functionConfig.rateLimit, {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowLimit: 5,
    windowSize: 60,
  });
  assert.equal(functionConfig.path, "/api/signup-open");
  assert.deepEqual(functionConfig.method, ["POST"]);
  assert.doesNotMatch(functionSource, /context\.ip|x-forwarded-for|x-nf-client-connection-ip/i);
  assert.doesNotMatch(functionSource, /@netlify\/blobs|getStore\(|console\./);
});

test("invalid signup-open payloads are rejected before Supabase", async () => {
  for (const invalidPayload of [
    { visitorId: "not-a-uuid" },
    { appMode: "forged" },
    { platform: "forged" },
    { clientOpenedAt: "not-a-date" },
    { unexpected: "field" },
  ]) {
    let calls = 0;
    const response = await handleSignupOpen(
      createRequest(invalidPayload),
      productionContext,
      createDependencies(async () => {
        calls += 1;
        return { error: null };
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  }

  assert.equal(validateSignupOpenPayload(null), null);
  assert.equal(validateSignupOpenPayload([]), null);
});

test("Preview and unpublished functions cannot write to Production", async () => {
  for (const context of [
    { deploy: { context: "deploy-preview", published: false } },
    { deploy: { context: "branch-deploy", published: false } },
    { deploy: { context: "production", published: false } },
    {},
  ]) {
    let clients = 0;
    const response = await handleSignupOpen(
      createRequest(),
      context,
      {
        ...createDependencies(async () => ({ error: null })),
        createClient() {
          clients += 1;
          return { rpc: async () => ({ error: null }) };
        },
      },
    );

    assert.equal(response.status, 204);
    assert.equal(clients, 0);
  }
});

test("Production function rejects a non-Production Supabase target", async () => {
  let clients = 0;
  const response = await handleSignupOpen(createRequest(), productionContext, {
    readEnv(name) {
      return name === "SUPABASE_URL"
        ? "https://qskeezefmvnutuzpevbc.supabase.co"
        : "unit-test-placeholder";
    },
    createClient() {
      clients += 1;
      return { rpc: async () => ({ error: null }) };
    },
  });

  assert.equal(response.status, 503);
  assert.equal(clients, 0);
});

test("browser roles cannot execute the protected signup-open RPC", () => {
  for (const sql of [protectionMigrationSql, schemaSql, previewBaselineSql]) {
    assert.match(
      sql,
      /revoke (?:all|execute) on function public\.record_signup_open\(uuid, text, text, timestamptz\)[\s\S]*?from public, anon, authenticated;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.record_signup_open\(uuid, text, text, timestamptz\)[\s\S]*?to service_role;/,
    );
  }

  assert.doesNotMatch(protectionMigrationSql, /grant execute[\s\S]*?to anon|to authenticated/);
});

test("signup-open storage keeps no account, IP, or raw user-agent identity", () => {
  assert.match(initialMigrationSql, /create table if not exists public\.signup_open_events/);
  assert.match(initialMigrationSql, /visitor_id uuid not null/);
  assert.match(initialMigrationSql, /unique \(visitor_id\)/);
  assert.doesNotMatch(initialMigrationSql, /email\s+text/i);
  assert.doesNotMatch(initialMigrationSql, /ip_address/i);
  assert.doesNotMatch(initialMigrationSql, /user_agent/i);
  assert.match(
    initialMigrationSql,
    /revoke all on table public\.signup_open_events from public, anon, authenticated;/,
  );
  assert.doesNotMatch(initialMigrationSql, /grant select on table public\.signup_open_events to anon/i);
});

test("browser tracking uses the rate-limited Function once per session", () => {
  assert.match(trackingSource, /入村手続き（会員登録）/);
  assert.match(trackingSource, /sessionStorage/);
  assert.match(trackingSource, /fetch\("\/api\/signup-open"/);
  assert.match(trackingSource, /RECORDED_STORAGE_KEY/);
  assert.match(trackingSource, /document\.addEventListener\("click", handleDocumentClick\)/);
  assert.doesNotMatch(trackingSource, /record_signup_open|supabase\.rpc|supabaseClient/);
});

test("signup open dashboard remains admin-only and grouped by Japan day", () => {
  assert.match(initialMigrationSql, /if not public\.is_app_admin\(\) then/);
  assert.match(initialMigrationSql, /time zone 'Asia\/Tokyo'/);
  assert.match(
    initialMigrationSql,
    /revoke all on function public\.get_signup_open_dashboard\(date\) from public, anon;/,
  );
  assert.match(
    initialMigrationSql,
    /grant execute on function public\.get_signup_open_dashboard\(date\) to authenticated;/,
  );
  assert.match(adminSource, /get_signup_open_dashboard/);
});

test("signup tracking and its admin route stay wired into the app entrypoint", () => {
  assert.match(mainSource, /import "\.\/signupOpenTracking\.js";/);
  assert.match(mainSource, /\/admin\/signup-opens/);
  assert.match(mainSource, /SignupOpenAdminApp/);
  assert.match(mainSource, /import "\.\/betaUsageAdminEntry\.js";/);
});
