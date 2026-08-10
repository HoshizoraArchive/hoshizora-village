import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_AVATAR_CONFLICT_CODE,
  getOwnedAvatarStoragePath,
  runProfileSaveWithAvatarLifecycle,
  saveProfileWithAvatarGuard,
} from "./profileAvatarStorage.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ORIGIN = "https://project-ref.supabase.co";

function avatarUrl(userId, timestamp) {
  return `${PROJECT_ORIGIN}/storage/v1/object/public/avatars/${userId}/avatar-cropped-${timestamp}.jpg`;
}

function createProfileQueryMock(result) {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    insert(payload) {
      calls.push(["insert", payload]);
      return this;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    single() {
      calls.push(["single"]);
      return Promise.resolve(result);
    },
    update(payload) {
      calls.push(["update", payload]);
      return this;
    },
  };

  return {
    calls,
    supabase: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

test("avatar A -> B saves B and removes only A", async () => {
  const removed = [];
  const savedUrls = [];
  const pathA = `${USER_ID}/avatar-cropped-100.jpg`;
  const pathB = `${USER_ID}/avatar-cropped-200.jpg`;

  const result = await runProfileSaveWithAvatarLifecycle({
    previousAvatarPath: pathA,
    removeAvatar: async (path) => {
      removed.push(path);
      return { error: null };
    },
    removePreviousAvatar: true,
    saveProfile: async (publicUrl) => {
      savedUrls.push(publicUrl);
      return { data: { avatar_url: publicUrl }, error: null };
    },
    uploadAvatar: async () => ({ error: null, path: pathB, publicUrl: avatarUrl(USER_ID, 200) }),
  });

  assert.equal(result.error, null);
  assert.deepEqual(savedUrls, [avatarUrl(USER_ID, 200)]);
  assert.deepEqual(removed, [pathA]);
  assert.notEqual(removed[0], pathB);
});

test("profile DB failure compensates B and preserves A", async () => {
  const removed = [];
  const pathA = `${USER_ID}/avatar-cropped-100.jpg`;
  const pathB = `${USER_ID}/avatar-cropped-200.jpg`;
  const databaseError = new Error("profile update failed");

  const result = await runProfileSaveWithAvatarLifecycle({
    previousAvatarPath: pathA,
    removeAvatar: async (path) => {
      removed.push(path);
      return { error: null };
    },
    removePreviousAvatar: true,
    saveProfile: async () => ({ data: null, error: databaseError }),
    uploadAvatar: async () => ({ error: null, path: pathB, publicUrl: avatarUrl(USER_ID, 200) }),
  });

  assert.equal(result.error, databaseError);
  assert.deepEqual(removed, [pathB]);
  assert.ok(!removed.includes(pathA));
});

test("upload failure does not write the profile or remove A", async () => {
  let saveCount = 0;
  const removed = [];
  const uploadError = new Error("upload failed");

  const result = await runProfileSaveWithAvatarLifecycle({
    previousAvatarPath: `${USER_ID}/avatar-cropped-100.jpg`,
    removeAvatar: async (path) => {
      removed.push(path);
      return { error: null };
    },
    removePreviousAvatar: true,
    saveProfile: async () => {
      saveCount += 1;
      return { data: {}, error: null };
    },
    uploadAvatar: async () => ({ error: uploadError }),
  });

  assert.equal(result.error, uploadError);
  assert.equal(result.stage, "upload");
  assert.equal(saveCount, 0);
  assert.deepEqual(removed, []);
});

test("saving an unchanged avatar performs no Storage removal", async () => {
  const removed = [];
  let saveCount = 0;

  const result = await runProfileSaveWithAvatarLifecycle({
    previousAvatarPath: `${USER_ID}/avatar-cropped-100.jpg`,
    removeAvatar: async (path) => {
      removed.push(path);
      return { error: null };
    },
    removePreviousAvatar: false,
    saveProfile: async (publicUrl) => {
      saveCount += 1;
      assert.equal(publicUrl, null);
      return { data: { avatar_url: avatarUrl(USER_ID, 100) }, error: null };
    },
  });

  assert.equal(result.error, null);
  assert.equal(saveCount, 1);
  assert.deepEqual(removed, []);
});

test("an external previous avatar URL is never treated as managed Storage", () => {
  assert.equal(
    getOwnedAvatarStoragePath({
      avatarUrl: "https://images.example.com/avatar.png",
      referenceUrl: avatarUrl(USER_ID, 200),
      userId: USER_ID,
    }),
    null,
  );
});

test("the known pre-crop avatar filename remains eligible for safe replacement cleanup", () => {
  const legacyUrl = `${PROJECT_ORIGIN}/storage/v1/object/public/avatars/${USER_ID}/avatar-100.png`;

  assert.equal(
    getOwnedAvatarStoragePath({
      avatarUrl: legacyUrl,
      referenceUrl: avatarUrl(USER_ID, 200),
      userId: USER_ID,
    }),
    `${USER_ID}/avatar-100.png`,
  );
});

test("another user's folder is never returned as a deletion target", () => {
  assert.equal(
    getOwnedAvatarStoragePath({
      avatarUrl: avatarUrl(OTHER_USER_ID, 100),
      referenceUrl: avatarUrl(USER_ID, 200),
      userId: USER_ID,
    }),
    null,
  );
});

test("the same uploaded/current avatar is not removed", async () => {
  const removed = [];
  const pathB = `${USER_ID}/avatar-cropped-200.jpg`;

  const result = await runProfileSaveWithAvatarLifecycle({
    previousAvatarPath: pathB,
    removeAvatar: async (path) => {
      removed.push(path);
      return { error: null };
    },
    removePreviousAvatar: true,
    saveProfile: async (publicUrl) => ({ data: { avatar_url: publicUrl }, error: null }),
    uploadAvatar: async () => ({ error: null, path: pathB, publicUrl: avatarUrl(USER_ID, 200) }),
  });

  assert.equal(result.error, null);
  assert.deepEqual(removed, []);
});

test("profile writes compare the expected avatar and reject stale concurrent updates", async () => {
  const previousUrl = avatarUrl(USER_ID, 100);
  const payload = { avatar_url: avatarUrl(USER_ID, 200), id: USER_ID };
  const { calls, supabase } = createProfileQueryMock({ data: null, error: null });

  const result = await saveProfileWithAvatarGuard({
    expectedAvatarUrl: previousUrl,
    profileExists: true,
    profilePayload: payload,
    selectColumns: "id, avatar_url",
    supabase,
  });

  assert.equal(result.error?.code, PROFILE_AVATAR_CONFLICT_CODE);
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "id" && call[2] === USER_ID));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "avatar_url" && call[2] === previousUrl));
  assert.ok(!calls.some((call) => call[0] === "insert"));
});

test("new profiles insert once instead of overwriting a concurrent creator", async () => {
  const payload = { avatar_url: avatarUrl(USER_ID, 200), id: USER_ID };
  const databaseError = Object.assign(new Error("duplicate key"), { code: "23505" });
  const { calls, supabase } = createProfileQueryMock({ data: null, error: databaseError });

  const result = await saveProfileWithAvatarGuard({
    expectedAvatarUrl: null,
    profileExists: false,
    profilePayload: payload,
    selectColumns: "id, avatar_url",
    supabase,
  });

  assert.equal(result.error, databaseError);
  assert.ok(calls.some((call) => call[0] === "insert" && call[1] === payload));
  assert.ok(!calls.some((call) => call[0] === "update"));
});

test("avatar DELETE policy limits owner/folder and rejects the current profile object", async () => {
  const migrationsDirectory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  const migrationFiles = (await readdir(migrationsDirectory)).filter((name) => name.endsWith("_add_avatar_delete_policy.sql"));

  assert.equal(migrationFiles.length, 1);
  const [migrationSql, schemaSql] = await Promise.all([
    readFile(new URL(`../supabase/migrations/${migrationFiles[0]}`, import.meta.url), "utf8"),
    readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  ]);

  for (const sql of [migrationSql, schemaSql]) {
    assert.match(sql, /for\s+delete\s+to\s+authenticated/i);
    assert.match(sql, /bucket_id\s*=\s*'avatars'/i);
    assert.match(sql, /owner_id\s*=\s*\(select auth\.uid\(\)::text\)/i);
    assert.match(sql, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*\(select auth\.uid\(\)::text\)/i);
    assert.match(sql, /not\s+exists\s*\([\s\S]*from public\.profiles/i);
    assert.match(sql, /p\.id\s*=\s*\(select auth\.uid\(\)\)/i);
    assert.match(sql, /storage\/v1\/object\/public\/avatars\//i);
  }

  assert.doesNotMatch(migrationSql, /to\s+(?:public|anon)\b/i);
  assert.ok(
    schemaSql.indexOf("create table if not exists public.profiles") <
      schemaSql.indexOf("create policy avatars_delete_own_unreferenced"),
  );
});
