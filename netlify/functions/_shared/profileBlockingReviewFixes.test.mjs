import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isTrustedProtectedProfile,
  readProtectedProfileIds,
  setTrustedProtectedProfileIds,
} from "../../../src/profileBlocking.js";

const cssSource = readFileSync("src/observePolish.css", "utf8");
const functionSource = readFileSync(
  "netlify/functions/black-hole-protected-profiles.mjs",
  "utf8",
);

test("authenticated protected profile ids hide app-admin actions without display-name heuristics", async () => {
  let requestedUrl = "";
  let requestedOptions = null;
  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: "test-access-token",
            },
          },
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
        return {
          profileIds: ["admin-profile", "guide-profile"],
        };
      },
    };
  };

  const profileIds = await readProtectedProfileIds(client, fetchImpl);
  setTrustedProtectedProfileIds(profileIds);

  assert.equal(requestedUrl, "/api/black-hole-protected-profiles");
  assert.equal(requestedOptions.method, "GET");
  assert.equal(requestedOptions.headers.Authorization, "Bearer test-access-token");
  assert.equal(isTrustedProtectedProfile({ id: "admin-profile" }), true);
  assert.equal(isTrustedProtectedProfile({ authorId: "admin-profile" }), true);
  assert.equal(isTrustedProtectedProfile({ id: "ordinary-profile" }), false);
});

test("the protected-profile endpoint requires authentication and reads only trusted DB records", () => {
  assert.match(functionSource, /requireAuthenticatedUser\(\{ request, supabase \}\)/);
  assert.match(functionSource, /from\("app_admins"\)\.select\("user_id"\)/);
  assert.match(functionSource, /from\("titles"\)[\s\S]*\.eq\("key", "celestial_guide"\)/);
  assert.match(functionSource, /from\("profile_titles"\)[\s\S]*\.eq\("is_primary", true\)/);
  assert.doesNotMatch(functionSource, /display_name|username/);
});

test("official corner emblems and black-hole menus reserve separate positions", () => {
  assert.match(
    cssSource,
    /\.post-card-panel:has\(\.profile-title-emblem-post-card-slot\) \[data-card-action="true"\][\s\S]*right: 5\.2rem/,
  );
});
