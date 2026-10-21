import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(appSource, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "App");
assert.ok(app, "App must exist");
const handlers = new Map(app.body.body.filter((node) => node.type === "FunctionDeclaration").map((node) => [node.id.name, appSource.slice(node.start, node.end)]));
function handler(name, env) {
  assert.ok(handlers.has(name), "must test real handler " + name);
  return new Function(...Object.keys(env), "return (" + handlers.get(name) + ");")(...Object.values(env));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function environment() {
  const live = { id: "A", key: "A:1" };
  return {
    live,
    captureDataMutationSession: () => ({ userId: live.id, sessionKey: live.key }),
    isCurrentDataMutationSession: (token) => Boolean(token?.userId && token.userId === live.id && token.sessionKey === live.key),
  };
}
function stateHarness(initial) {
  const state = { ...initial };
  const setters = new Proxy({}, { get(_, name) {
    return (next) => {
      const key = name.slice(3, 4).toLowerCase() + name.slice(4);
      state[key] = typeof next === "function" ? next(state[key]) : next;
    };
  } });
  return { state, setters };
}
function settingHarness({ pending, env, state, setters, id = "A", field = "notify_authors_when_i_archive", next = false, pendingRef = { current: new Set() } }) {
  const calls = [];
  const update = () => ({
    eq: (column, value) => {
      calls.push([column, value]);
      return pending.promise;
    },
  });
  const save = handler("saveProfileNotificationSetting", {
    session: { user: { id } },
    profile: { id, [field]: !next },
    captureDataMutationSession: env.captureDataMutationSession,
    isCurrentDataMutationSession: env.isCurrentDataMutationSession,
    profileNotificationSettingPendingRef: pendingRef,
    supabase: { from: (name) => { assert.equal(name, "profiles"); return { update: (payload) => { assert.deepEqual(payload, { [field]: next }); return update(); } }; } },
    setProfileSaving: setters.setProfileSaving, setProfileMessage: setters.setProfileMessage, setProfileError: setters.setProfileError,
    setProfile: setters.setProfile, setProfileForm: setters.setProfileForm,
    logSafeError() {}, ERROR_OPERATION: { PROFILE_SAVE: "profile_save" },
  });
  return { save: () => save(field, next, "Archive通知"), calls };
}

test("late notification setting save from A cannot change B's form or profile", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A" }, profileForm: { notify_authors_when_i_archive: true }, profileSaving: false, profileMessage: "", profileError: "" });
  const pending = deferred();
  const { save, calls } = settingHarness({ pending, env, state, setters });
  const oldSave = save();
  assert.deepEqual(calls, [["id", "A"]]);
  env.live.id = "B"; env.live.key = "B:2";
  state.profile = { id: "B", notify_authors_when_i_archive: true };
  state.profileForm = { notify_authors_when_i_archive: true };
  state.profileSaving = true;
  pending.resolve({ error: null });
  await oldSave;
  assert.equal(state.profile.id, "B");
  assert.equal(state.profileForm.notify_authors_when_i_archive, true);
  assert.equal(state.profileSaving, true);
  assert.equal(state.profileMessage, "");
});

test("late failed setting save from A cannot rollback B's setting", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A" }, profileForm: { notify_authors_when_i_archive: false }, profileSaving: false, profileMessage: "", profileError: "" });
  const pending = deferred();
  const { save } = settingHarness({ pending, env, state, setters });
  const oldSave = save();
  env.live.id = "B"; env.live.key = "B:2";
  state.profile = { id: "B", notify_authors_when_i_archive: false };
  state.profileForm = { notify_authors_when_i_archive: false };
  state.profileSaving = true;
  pending.resolve({ error: { code: "42501" } });
  await oldSave;
  assert.equal(state.profileForm.notify_authors_when_i_archive, false);
  assert.equal(state.profileError, "");
  assert.equal(state.profileSaving, true);
});

test("same-account duplicate setting saves are blocked before a second DB write", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A", notify_authors_when_i_archive: true }, profileForm: { notify_authors_when_i_archive: true }, profileSaving: false, profileMessage: "", profileError: "" });
  const first = deferred(), second = deferred();
  const pendingFields = { current: new Set() };
  const a = settingHarness({ pending: first, env, state, setters, pendingRef: pendingFields, next: false });
  const b = settingHarness({ pending: second, env, state, setters, pendingRef: pendingFields, next: true });
  const runA = a.save(), runB = b.save();
  await runB;
  assert.equal(b.calls.length, 0, "duplicate request must never write to DB");
  assert.equal(state.profileSaving, true);
  first.resolve({ error: null }); await runA;
  assert.equal(state.profile.notify_authors_when_i_archive, false);
  assert.equal(state.profileForm.notify_authors_when_i_archive, false);
  assert.equal(state.profileSaving, false);
});

function notificationHarness({ pending, env, state, setters, user = "A", notificationId = "n1" }) {
  const columns = [];
  const query = {
    eq: (field, value) => { columns.push([field, value]); return query; },
    select: () => query,
    single: () => pending.promise,
  };
  const execute = handler("handleMarkNotificationRead", {
    session: { user: { id: user } }, captureDataMutationSession: env.captureDataMutationSession,
    isCurrentDataMutationSession: env.isCurrentDataMutationSession,
    supabase: { from: (table) => { assert.equal(table, "notifications"); return { update: (payload) => { assert.deepEqual(payload, { is_read: true }); return query; } }; } },
    getUserFacingError: () => "安全なエラー",
    ERROR_OPERATION: { NOTIFICATION_SAVE: "notification_save" },
    setNotificationsMessage: setters.setNotificationsMessage, setNotificationsError: setters.setNotificationsError,
    setNotificationUpdatingId: setters.setNotificationUpdatingId, setNotifications: setters.setNotifications,
    logSafeError() {},
  });
  return { execute: () => execute(notificationId), columns };
}

test("late A notification success must not mark B notification read", async () => {
  const env = environment(); const { state, setters } = stateHarness({
    notifications: [{ id: "n1", is_read: false }], notificationUpdatingId: null, notificationsError: "", notificationsMessage: "",
  });
  const pending = deferred();
  const { execute, columns } = notificationHarness({ pending, env, state, setters });
  const runA = execute();
  assert.deepEqual(columns, [["id", "n1"], ["recipient_id", "A"]]);
  env.live.id = "B"; env.live.key = "B:2";
  state.notifications = [{ id: "n1", is_read: false }]; state.notificationUpdatingId = "B-other";
  pending.resolve({ data: { id: "n1", is_read: true }, error: null }); await runA;
  assert.equal(state.notifications[0].is_read, false);
  assert.equal(state.notificationUpdatingId, "B-other");
  assert.equal(state.notificationsMessage, "");
});

test("late A notification error must not write into B's Re:Connect screen", async () => {
  const env = environment(); const { state, setters } = stateHarness({ notifications: [], notificationUpdatingId: null, notificationsError: "", notificationsMessage: "" });
  const pending = deferred();
  const { execute } = notificationHarness({ pending, env, state, setters });
  const runA = execute();
  env.live.id = "B"; env.live.key = "B:2"; state.notificationUpdatingId = "B-other";
  pending.resolve({ data: null, error: { code: "fail" } }); await runA;
  assert.equal(state.notificationsError, "");
  assert.equal(state.notificationUpdatingId, "B-other");
});

test("onboarding refresh from A→B→A discards prior-generation response", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ onboardingProgress: null, onboardingError: "" });
  const progressRef = { current: { user_id: "A", current_step: "profile_setup" } };
  const pending = deferred();
  const query = { select: () => query, eq: () => query, maybeSingle: () => pending.promise };
  const execute = handler("refreshInitialOnboardingProgress", {
    session: { user: { id: "A" } }, onboardingProgressRef: progressRef,
    captureDataMutationSession: env.captureDataMutationSession, isCurrentDataMutationSession: env.isCurrentDataMutationSession,
    isOnboardingProgressForUser: (progress, userId) => progress?.user_id === userId,
    canApplyOnboardingProgressResponse: ({ activeUserId, progress, requestedUserId }) => activeUserId === requestedUserId && progress?.user_id === requestedUserId,
    activeSessionUserIdRef: { current: "A" },
    supabase: { from: () => query }, ONBOARDING_PROGRESS_SELECT_COLUMNS: "user_id,current_step",
    setOnboardingProgress: setters.setOnboardingProgress, setOnboardingError: setters.setOnboardingError,
    isMissingOnboardingSchemaError: () => false, getUserFacingError: () => "失敗",
    logSafeError() {}, ERROR_OPERATION: { ONBOARDING_LOAD: "onboarding_load" },
  });
  const run = execute();
  env.live.id = "B"; env.live.key = "B:2";
  env.live.id = "A"; env.live.key = "A:3";
  state.onboardingProgress = { user_id: "A", current_step: "current" };
  progressRef.current = state.onboardingProgress;
  pending.resolve({ data: { user_id: "A", current_step: "old" }, error: null }); await run;
  assert.equal(state.onboardingProgress.current_step, "current");
  assert.equal(progressRef.current.current_step, "current");
});

test("current user's settings save succeeds and clears busy status", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A", notify_authors_when_i_archive: true }, profileForm: { notify_authors_when_i_archive: false }, profileSaving: false, profileMessage: "", profileError: "" });
  const pending = deferred();
  const { save } = settingHarness({ pending, env, state, setters });
  const promise = save();
  assert.equal(state.profileSaving, true);
  pending.resolve({ error: null });
  await promise;
  assert.equal(state.profile.notify_authors_when_i_archive, false);
  assert.equal(state.profileForm.notify_authors_when_i_archive, false);
  assert.equal(state.profileSaving, false);
  assert.match(state.profileMessage, /保存しました/);
});

test("current user's settings Promise rejection restores saving state and a safe error", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A" }, profileForm: { notify_authors_when_i_archive: false }, profileSaving: false, profileMessage: "", profileError: "" });
  const pending = deferred();
  const { save } = settingHarness({ pending, env, state, setters });
  const promise = save();
  pending.reject(new Error("private transport details"));
  await promise;
  assert.equal(state.profileSaving, false);
  assert.equal(state.profileForm.notify_authors_when_i_archive, true);
  assert.equal(state.profileError.includes("設定の保存に失敗しました"), true);
  assert.equal(state.profileMessage, "");
});

test("two independent notification settings keep busy state until both complete", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ profile: { id: "A" }, profileForm: {}, profileSaving: false, profileMessage: "", profileError: "" });
  const pending1 = deferred(), pending2 = deferred();
  const activeFields = { current: new Set() };
  const first = settingHarness({ pending: pending1, env, state, setters, pendingRef: activeFields, field: "notify_authors_when_i_archive" });
  const second = settingHarness({ pending: pending2, env, state, setters, pendingRef: activeFields, field: "notify_authors_when_i_resonate" });
  const p1 = first.save(), p2 = second.save();
  pending1.resolve({ error: null }); await p1;
  assert.equal(state.profileSaving, true);
  pending2.resolve({ error: null }); await p2;
  assert.equal(state.profileSaving, false);
});

test("current notification success sets only its own read flag", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ notifications: [{ id: "n1", is_read: false }, { id: "n2", is_read: false }], notificationUpdatingId: null, notificationsError: "", notificationsMessage: "" });
  const pending = deferred();
  const { execute } = notificationHarness({ pending, env, state, setters });
  const promise = execute();
  assert.equal(state.notificationUpdatingId, "n1");
  pending.resolve({ data: { id: "n1", is_read: true }, error: null }); await promise;
  assert.equal(state.notifications[0].is_read, true);
  assert.equal(state.notifications[1].is_read, false);
  assert.equal(state.notificationUpdatingId, null);
});

test("different in-flight notification read cannot clear newer notification spinner", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ notifications: [{ id: "n1", is_read: false }, { id: "n2", is_read: false }], notificationUpdatingId: null, notificationsError: "", notificationsMessage: "" });
  const one = deferred(), two = deferred();
  const a = notificationHarness({ pending: one, env, state, setters, notificationId: "n1" });
  const b = notificationHarness({ pending: two, env, state, setters, notificationId: "n2" });
  const p1 = a.execute(), p2 = b.execute();
  one.resolve({ data: { id: "n1", is_read: true }, error: null }); await p1;
  assert.equal(state.notificationUpdatingId, "n2");
  assert.equal(state.notifications[0].is_read, true);
  two.resolve({ data: { id: "n2", is_read: true }, error: null }); await p2;
  assert.equal(state.notificationUpdatingId, null);
  assert.equal(state.notifications[1].is_read, true);
});

test("notification rejection clears current spinner without leaking raw error", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ notifications: [], notificationUpdatingId: null, notificationsError: "", notificationsMessage: "" });
  const pending = deferred();
  const { execute } = notificationHarness({ pending, env, state, setters });
  const promise = execute();
  pending.reject(new Error("private token details"));
  await promise;
  assert.equal(state.notificationUpdatingId, null);
  assert.equal(state.notificationsError, "安全なエラー");
});

test("onboarding old generation's error also cannot disturb restored A", async () => {
  const env = environment();
  const { state, setters } = stateHarness({ onboardingProgress: null, onboardingError: "" });
  const progressRef = { current: { user_id: "A", current_step: "profile_setup" } };
  const pending = deferred();
  const query = { select: () => query, eq: () => query, maybeSingle: () => pending.promise };
  const execute = handler("refreshInitialOnboardingProgress", {
    session: { user: { id: "A" } }, onboardingProgressRef: progressRef,
    captureDataMutationSession: env.captureDataMutationSession, isCurrentDataMutationSession: env.isCurrentDataMutationSession,
    isOnboardingProgressForUser: (progress, userId) => progress?.user_id === userId,
    canApplyOnboardingProgressResponse: () => true, activeSessionUserIdRef: { current: "A" },
    supabase: { from: () => query }, ONBOARDING_PROGRESS_SELECT_COLUMNS: "user_id,current_step",
    setOnboardingProgress: setters.setOnboardingProgress, setOnboardingError: setters.setOnboardingError,
    isMissingOnboardingSchemaError: () => false, getUserFacingError: () => "old request failed",
    logSafeError() {}, ERROR_OPERATION: { ONBOARDING_LOAD: "onboarding_load" },
  });
  const promise = execute();
  env.live.id = "B"; env.live.key = "B:2";
  env.live.id = "A"; env.live.key = "A:3";
  state.onboardingError = "current session's own message";
  pending.resolve({ data: null, error: { code: "old_failure" } }); await promise;
  assert.equal(state.onboardingError, "current session's own message");
});
