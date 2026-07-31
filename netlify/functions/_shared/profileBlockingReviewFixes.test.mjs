import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getProtectedProfileLookupState,
  hashProtectedProfileId,
  isTrustedProtectedProfile,
  readBlockedProfileIds,
  readProtectedProfileHashes,
  setTrustedProtectedProfileHashes,
} from "../../../src/profileBlocking.js";
import {
  createProtectedProfileHashPayload,
  hashProtectedProfileId as hashProtectedProfileIdOnServer,
  readProtectedProfileIdsFromDatabase,
} from "../black-hole-protected-profiles.mjs";

const cssSource = readFileSync("src/observePolish.css", "utf8");
const functionSource = readFileSync(
  "netlify/functions/black-hole-protected-profiles.mjs",
  "utf8",
);
const protectedProfileId = "00000000-0000-0000-0000-000000000001";
const ordinaryProfileId = "00000000-0000-0000-0000-000000000099";
const expectedProtectedProfileHash =
  "7ac1b8d7010bb6cd3a3e84e7f90136b880bbc899e428ece49333372911ab9052";

test("browser and server derive the same SHA-256 digest for a protected profile id", () => {
  const nodeHash = createHash("sha256").update(protectedProfileId).digest("hex");

  assert.equal(nodeHash, expectedProtectedProfileHash);
  assert.equal(hashProtectedProfileId(protectedProfileId), expectedProtectedProfileHash);
  assert.equal(hashProtectedProfileIdOnServer(protectedProfileId), expectedProtectedProfileHash);
  assert.equal(hashProtectedProfileId(protectedProfileId.toUpperCase()), expectedProtectedProfileHash);
});

test("protected-profile payload exposes padded opaque digests instead of raw profile ids", () => {
  let decoyIndex = 0;
  const payload = createProtectedProfileHashPayload(
    [protectedProfileId, "00000000-0000-0000-0000-000000000002"],
    {
      randomHash: () => (++decoyIndex).toString(16).padStart(64, "0"),
      randomIndex: () => 0,
    },
  );
  const serializedPayload = JSON.stringify(payload);

  assert.equal(payload.profileHashes.length, 32);
  assert.equal(new Set(payload.profileHashes).size, 32);
  assert.ok(payload.profileHashes.every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert.ok(payload.profileHashes.includes(expectedProtectedProfileHash));
  assert.equal(serializedPayload.includes(protectedProfileId), false);
  assert.doesNotMatch(functionSource, /return pushJsonResponse\(200, \{\s*profileIds/);
});

test("protected-profile database reader uses only app-admin and active primary guide records", async () => {
  const calls = [];
  const supabase = {
    from(table) {
      calls.push(table);

      if (table === "app_admins") {
        return {
          async select(columns) {
            assert.equal(columns, "user_id");
            return { data: [{ user_id: "admin-profile" }], error: null };
          },
        };
      }

      if (table === "titles") {
        const builder = {
          eq(column, value) {
            calls.push(`${column}:${value}`);
            return builder;
          },
          async maybeSingle() {
            return { data: { id: "guide-title" }, error: null };
          },
          select(columns) {
            assert.equal(columns, "id");
            return builder;
          },
        };
        return builder;
      }

      assert.equal(table, "profile_titles");
      const builder = {
        eq(column, value) {
          calls.push(`${column}:${value}`);

          if (column === "is_primary") {
            return Promise.resolve({
              data: [{ profile_id: "guide-profile" }],
              error: null,
            });
          }

          return builder;
        },
        select(columns) {
          assert.equal(columns, "profile_id");
          return builder;
        },
      };
      return builder;
    },
  };

  assert.deepEqual(await readProtectedProfileIdsFromDatabase(supabase), [
    "admin-profile",
    "guide-profile",
  ]);
  assert.ok(calls.includes("key:celestial_guide"));
  assert.ok(calls.includes("is_active:true"));
  assert.ok(calls.includes("is_primary:true"));
});

test("authenticated digest lookup hides protected actions without returning raw ids", async () => {
  let requestedUrl = "";
  let requestedOptions = null;
  const client = {
    auth: {
      async getSession() {
        return {
          data: { session: { access_token: "test-access-token" } },
          error: null,
        };
      },
    },
  };
  const fetchImpl = async (url, options) => {
    requestedUrl = url;
    requestedOptions = options;
    return {
      ok: true,
      async json() {
        return { profileHashes: [expectedProtectedProfileHash] };
      },
    };
  };

  const profileHashes = await readProtectedProfileHashes(client, fetchImpl);
  setTrustedProtectedProfileHashes(profileHashes);

  assert.equal(requestedUrl, "/api/black-hole-protected-profiles");
  assert.equal(requestedOptions.method, "GET");
  assert.equal(requestedOptions.headers.Authorization, "Bearer test-access-token");
  assert.equal(getProtectedProfileLookupState(), "ready");
  assert.equal(isTrustedProtectedProfile({ id: protectedProfileId }), true);
  assert.equal(isTrustedProtectedProfile({ authorId: protectedProfileId }), true);
  assert.equal(isTrustedProtectedProfile({ id: ordinaryProfileId }), false);
});

test("protected-profile lookup failure fails closed while preserving block-list loading", async () => {
  setTrustedProtectedProfileHashes([]);
  assert.equal(isTrustedProtectedProfile({ id: ordinaryProfileId }), false);

  const client = {
    auth: {
      async getSession() {
        return {
          data: { session: { access_token: "test-access-token" } },
          error: null,
        };
      },
    },
    from(table) {
      assert.equal(table, "profile_blocks");
      return {
        async select(columns) {
          assert.equal(columns, "blocked_id");
          return { data: [{ blocked_id: "blocked-profile" }], error: null };
        },
      };
    },
  };

  const blockedIds = await readBlockedProfileIds(client, async () => {
    throw new Error("network unavailable");
  });

  assert.deepEqual([...blockedIds], ["blocked-profile"]);
  assert.equal(getProtectedProfileLookupState(), "unavailable");
  assert.equal(isTrustedProtectedProfile({ id: ordinaryProfileId }), true);
});

test("official corner emblem, author menu, and heading reserve separate iPhone-width space", () => {
  assert.match(
    cssSource,
    /\.post-card-panel:has\(> \.profile-title-emblem-post-card-slot\):has\(> \[data-card-action="true"\]\.absolute\)[\s\S]*> \[data-card-action="true"\]\.absolute[\s\S]*right: 5\.2rem/,
  );
  assert.match(
    cssSource,
    /\.post-card-panel:has\(> \.profile-title-emblem-post-card-slot\):has\(> \[data-card-action="true"\]\.absolute\)[\s\S]*\.post-card-content > div:first-child > div:last-child[\s\S]*padding-right: 8\.5rem/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.post-card-panel:has\(\.profile-title-emblem-post-card-slot\) \[data-card-action="true"\]/,
  );
});
