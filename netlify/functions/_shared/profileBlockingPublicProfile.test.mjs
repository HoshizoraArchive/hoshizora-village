import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedProtectedProfile,
  setTrustedProtectedProfileHashes,
} from "../../../src/profileBlocking.js";

test("unresolved public-profile protection fails closed without changing ordinary hint behavior", () => {
  setTrustedProtectedProfileHashes([]);

  assert.equal(
    isTrustedProtectedProfile({
      primaryTitle: null,
    }),
    true,
  );
  assert.equal(
    isTrustedProtectedProfile({
      displayName: "村人さん",
      username: "villager",
    }),
    false,
  );
  assert.equal(
    isTrustedProtectedProfile({
      id: "00000000-0000-0000-0000-000000000099",
      primaryTitle: null,
    }),
    false,
  );
  assert.equal(
    isTrustedProtectedProfile({
      primaryTitle: { key: "celestial_guide" },
    }),
    true,
  );
});
