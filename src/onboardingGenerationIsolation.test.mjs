import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "App");
assert.ok(app, "App source must be available");
const functions = new Map(app.body.body.filter((node) => node.type === "FunctionDeclaration").map((node) => [node.id.name, source.slice(node.start, node.end)]));
const initialEffect = app.body.body.find((node) => node.type === "ExpressionStatement" && node.expression.callee?.name === "useEffect" && source.slice(node.start, node.end).includes("async function readOnboardingProgress()"));
assert.ok(initialEffect, "onboarding bootstrap effect must exist");
function getFunction(name, context) {
  const functionCode = functions.get(name);
  assert.ok(functionCode, name);
  return new Function(...Object.keys(context), "return (" + functionCode + ")")(...Object.values(context));
}
function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function createState(initial = {}) {
  const state = { ...initial };
  const setters = new Proxy({}, {
    get(_, name) {
      return (value) => {
        const prop = name.slice(3, 4).toLowerCase() + name.slice(4);
        state[prop] = typeof value === "function" ? value(state[prop]) : value;
      };
    },
  });
  return { state, setters };
}
function runtime() {
  const active = { id: "A", key: "A:1" };
  return {
    active,
    captureDataMutationSession: () => ({ userId: active.id, sessionKey: active.key }),
    isCurrentDataMutationSession: (token) => token?.userId === active.id && token?.sessionKey === active.key,
  };
}
function advanceHarness({ pending, currentStep = "profile_setup", initialBusy = false }) {
  const run = runtime();
  const { state, setters } = createState({ onboardingBusy: initialBusy, onboardingError: "", onboardingProgress: { user_id: "A", current_step: currentStep } });
  const onboardingProgressRef = { current: state.onboardingProgress };
  const onboardingAdvanceInFlightRef = { current: false };
  const errors = [];
  const navigation = [];
  const rpcCalls = [];
  const advance = getFunction("advanceInitialOnboarding", {
    session: { user: { id: "A" } },
    onboardingProgressRef,
    onboardingAdvanceInFlightRef,
    captureDataMutationSession: run.captureDataMutationSession,
    isCurrentDataMutationSession: run.isCurrentDataMutationSession,
    activeSessionUserIdRef: { current: "A" },
    supabase: { rpc: (name, args) => { rpcCalls.push({ name, args }); return pending.promise; } },
    setOnboardingBusy: setters.setOnboardingBusy, setOnboardingError: setters.setOnboardingError,
    setOnboardingProgress: setters.setOnboardingProgress,
    isMissingOnboardingSchemaError: () => false,
    isOnboardingProgressForUser: (progress, userId) => progress?.user_id === userId,
    logSafeError: (_operation, error) => errors.push(error?.message),
    getUserFacingError: () => "保存できませんでした。",
    ERROR_OPERATION: { ONBOARDING_SAVE: "onboarding_save" },
    handleTabChange: (tab) => navigation.push(tab),
  });
  return { ...run, state, onboardingProgressRef, onboardingAdvanceInFlightRef, rpcCalls, navigation, errors, advance };
}
function successful(step = "post_intro_1", id = "A") {
  return { data: { outcome: "advanced", progress: { user_id: id, current_step: step } }, error: null };
}
test("old A advance completion cannot overwrite B's active onboarding progress", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved", { navigateTo: "post" });
  assert.equal(ctx.state.onboardingBusy, true);
  ctx.active.id = "B"; ctx.active.key = "B:2";
  ctx.onboardingAdvanceInFlightRef.current = true; ctx.state.onboardingBusy = true;
  ctx.onboardingProgressRef.current = { user_id: "B", current_step: "notification_permission" };
  ctx.state.onboardingProgress = ctx.onboardingProgressRef.current;
  pending.resolve(successful());
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingProgress.user_id, "B");
  assert.equal(ctx.state.onboardingBusy, true);
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, true);
  assert.deepEqual(ctx.navigation, []);
});
test("A→B→A before rerender cannot apply old A advance result or navigate", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved", { navigateTo: "post" });
  ctx.active.id = "B"; ctx.active.key = "B:2";
  ctx.active.id = "A"; ctx.active.key = "A:3";
  ctx.state.onboardingProgress = { user_id: "A", current_step: "newer" };
  ctx.onboardingProgressRef.current = ctx.state.onboardingProgress;
  ctx.onboardingAdvanceInFlightRef.current = true; ctx.state.onboardingBusy = true;
  pending.resolve(successful());
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingProgress.current_step, "newer");
  assert.equal(ctx.onboardingProgressRef.current.current_step, "newer");
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, true);
  assert.equal(ctx.state.onboardingBusy, true);
  assert.deepEqual(ctx.navigation, []);
});
test("old A rejected RPC after A→B→A must not clear B's busy/error state", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved");
  ctx.active.id = "B"; ctx.active.key = "B:2";
  ctx.active.id = "A"; ctx.active.key = "A:3";
  ctx.state.onboardingError = "new error"; ctx.state.onboardingBusy = true;
  ctx.onboardingAdvanceInFlightRef.current = true;
  pending.reject(new Error("old A private failure"));
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingError, "new error");
  assert.equal(ctx.state.onboardingBusy, true);
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, true);
  assert.deepEqual(ctx.errors, []);
});
test("old A RPC returns invalid outcome; new A's error display stays intact", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("archive_saved");
  ctx.active.key = "A:3";
  ctx.state.onboardingError = "new error";
  pending.resolve({ data: { outcome: "invalid_step" }, error: null });
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingError, "new error");
});
test("same-session success updates current progress and completes busy state", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved", { navigateTo: "post" });
  assert.equal(ctx.rpcCalls[0].name, "advance_initial_onboarding");
  pending.resolve(successful());
  assert.equal((await operation).current_step, "post_intro_1");
  assert.equal(ctx.onboardingProgressRef.current.current_step, "post_intro_1");
  assert.equal(ctx.state.onboardingBusy, false);
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, false);
  assert.deepEqual(ctx.navigation, ["post"]);
});
test("same-session RPC rejection safely releases single-flight state", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved");
  pending.reject(new Error("transport details"));
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingBusy, false);
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, false);
  assert.equal(ctx.state.onboardingError, "保存できませんでした。");
  assert.deepEqual(ctx.errors, ["transport details"]);
});
test("same-session RPC returned error safely releases single-flight state", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved");
  pending.resolve({ data: null, error: { code: "42501" } });
  assert.equal(await operation, null);
  assert.equal(ctx.state.onboardingBusy, false);
  assert.equal(ctx.onboardingAdvanceInFlightRef.current, false);
  assert.equal(ctx.state.onboardingError, "保存できませんでした。");
});
test("in-flight onboarding still allows only one same-session RPC", async () => {
  const pending = deferred(), ctx = advanceHarness({ pending });
  const operation = ctx.advance("profile_saved");
  assert.equal(await ctx.advance("profile_saved"), null);
  assert.equal(ctx.rpcCalls.length, 1);
  pending.resolve(successful());
  await operation;
});

function initialHarness({ userId = "A", key = "A:1" } = {}) {
  const { state, setters } = createState({ onboardingProgress: null, onboardingLoading: false, onboardingError: "" });
  const r = runtime();
  r.active.id = userId; r.active.key = key;
  const onboardRef = { current: null }, inFlight = { current: false }, postComplete = { current: false };
  const pending = deferred();
  const calls = [], navigation = [];
  const context = {
    sessionUserId: userId, authIdentityEpoch: 1,
    activeSessionUserIdRef: { current: userId },
    captureDataMutationSession: r.captureDataMutationSession,
    isCurrentDataMutationSession: r.isCurrentDataMutationSession,
    onboardingProgressRef: onboardRef, onboardingAdvanceInFlightRef: inFlight,
    onboardingPostCompletionRef: postComplete,
    setOnboardingProgress: setters.setOnboardingProgress, setOnboardingBusy: setters.setOnboardingBusy,
    setOnboardingLoading: setters.setOnboardingLoading, setOnboardingError: setters.setOnboardingError,
    supabase: { from: (table) => { assert.equal(table, "user_onboarding_progress"); return {
      select: () => ({ eq: () => ({ maybeSingle: () => pending.promise }) }),
    }; } },
    ONBOARDING_PROGRESS_SELECT_COLUMNS: "user_id,current_step",
    isMissingOnboardingSchemaError: () => false,
    isOnboardingProgressForUser: (progress, id) => progress?.user_id === id,
    isOnboardingActive: (progress) => Boolean(progress),
    canApplyOnboardingProgressResponse: ({ activeUserId, progress, requestedUserId }) => activeUserId === requestedUserId && progress?.user_id === requestedUserId,
    getOnboardingResumeTab: (step) => step === "post_intro_1" ? "post" : "observe",
    handleTabChange: (tab) => navigation.push(tab),
    logSafeError: (...args) => calls.push(args),
    getUserFacingError: () => "確認できませんでした。",
    ERROR_OPERATION: { ONBOARDING_LOAD: "onboarding_load" },
  };
  const callbackSource = source.slice(initialEffect.expression.arguments[0].start, initialEffect.expression.arguments[0].end);
  const effect = new Function(...Object.keys(context), "return (" + callbackSource + ")")(...Object.values(context));
  return { ...r, effect, state, onboardRef, inFlight, pending, calls, navigation, context };
}
test("bootstrap A→B→A without effect cleanup rejects old A success", async () => {
  const ctx = initialHarness(); ctx.effect();
  ctx.active.key = "B:2"; ctx.active.id = "B";
  ctx.active.key = "A:3"; ctx.active.id = "A";
  ctx.state.onboardingProgress = { user_id: "A", current_step: "current" };
  ctx.onboardRef.current = ctx.state.onboardingProgress;
  ctx.pending.resolve({ data: { user_id: "A", current_step: "post_intro_1" }, error: null });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ctx.state.onboardingProgress.current_step, "current");
  assert.deepEqual(ctx.navigation, []);
});
test("bootstrap A→B→A before cleanup rejects old A error without clearing B state", async () => {
  const ctx = initialHarness(); ctx.effect();
  ctx.active.key = "A:3";
  ctx.state.onboardingLoading = true; ctx.state.onboardingError = "current error";
  ctx.pending.resolve({ data: null, error: { code: "old" } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ctx.state.onboardingLoading, true);
  assert.equal(ctx.state.onboardingError, "current error");
  assert.deepEqual(ctx.calls, []);
});
test("bootstrap same-session succeeds, then cleanup prevents further updates", async () => {
  const ctx = initialHarness();
  const cleanup = ctx.effect();
  ctx.pending.resolve({ data: { user_id: "A", current_step: "post_intro_1" }, error: null });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ctx.state.onboardingLoading, false);
  assert.equal(ctx.state.onboardingProgress.current_step, "post_intro_1");
  assert.deepEqual(ctx.navigation, ["post"]);
  cleanup();
});
test("bootstrap same-session Promise rejection sets safe error and clears spinner", async () => {
  const ctx = initialHarness();
  ctx.effect();
  ctx.pending.reject(new Error("private transport details"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ctx.state.onboardingLoading, false);
  assert.equal(ctx.state.onboardingError, "確認できませんでした。");
  assert.equal(ctx.calls.length, 1);
});

test("bootstrap old A Promise rejection after A→B→A is ignored", async () => {
  const ctx = initialHarness();
  ctx.effect();
  ctx.active.id = "B"; ctx.active.key = "B:2";
  ctx.active.id = "A"; ctx.active.key = "A:3";
  ctx.state.onboardingLoading = true; ctx.state.onboardingError = "new status";
  ctx.pending.reject(new Error("private old A failure"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ctx.state.onboardingLoading, true);
  assert.equal(ctx.state.onboardingError, "new status");
  assert.deepEqual(ctx.calls, []);
});

test("manual onboarding refresh same-session transport rejection is handled", async () => {
  const r = runtime();
  const { state, setters } = createState({ onboardingError: "", onboardingProgress: null });
  const progress = { current: { user_id: "A", current_step: "profile_setup" } };
  const pending = deferred();
  const logs = [];
  const query = { select: () => query, eq: () => query, maybeSingle: () => pending.promise };
  const refresh = getFunction("refreshInitialOnboardingProgress", {
    session: { user: { id: "A" } },
    captureDataMutationSession: r.captureDataMutationSession,
    isCurrentDataMutationSession: r.isCurrentDataMutationSession,
    onboardingProgressRef: progress,
    isOnboardingProgressForUser: (item, id) => item?.user_id === id,
    canApplyOnboardingProgressResponse: () => true,
    activeSessionUserIdRef: { current: "A" },
    supabase: { from: () => query },
    ONBOARDING_PROGRESS_SELECT_COLUMNS: "user_id,current_step",
    isMissingOnboardingSchemaError: () => false,
    getUserFacingError: () => "確認できませんでした。",
    logSafeError: (...args) => logs.push(args),
    ERROR_OPERATION: { ONBOARDING_LOAD: "onboarding_load" },
    setOnboardingError: setters.setOnboardingError,
    setOnboardingProgress: setters.setOnboardingProgress,
  });
  const result = refresh();
  pending.reject(new Error("private RPC failure"));
  assert.equal(await result, null);
  assert.equal(state.onboardingError, "確認できませんでした。");
  assert.equal(logs.length, 1);
});

test("manual onboarding refresh rejected old A request does not affect current A after return", async () => {
  const r = runtime();
  const { state, setters } = createState({ onboardingError: "" });
  const progress = { current: { user_id: "A", current_step: "profile_setup" } };
  const pending = deferred();
  const query = { select: () => query, eq: () => query, maybeSingle: () => pending.promise };
  const refresh = getFunction("refreshInitialOnboardingProgress", {
    session: { user: { id: "A" } },
    captureDataMutationSession: r.captureDataMutationSession,
    isCurrentDataMutationSession: r.isCurrentDataMutationSession,
    onboardingProgressRef: progress,
    isOnboardingProgressForUser: (item, id) => item?.user_id === id,
    canApplyOnboardingProgressResponse: () => true,
    activeSessionUserIdRef: { current: "A" },
    supabase: { from: () => query },
    ONBOARDING_PROGRESS_SELECT_COLUMNS: "user_id,current_step",
    isMissingOnboardingSchemaError: () => false,
    getUserFacingError: () => "失敗",
    logSafeError: () => assert.fail("stale error logged"),
    ERROR_OPERATION: { ONBOARDING_LOAD: "onboarding_load" },
    setOnboardingError: setters.setOnboardingError,
    setOnboardingProgress: setters.setOnboardingProgress,
  });
  const result = refresh();
  r.active.id = "B"; r.active.key = "B:2";
  r.active.id = "A"; r.active.key = "A:3";
  state.onboardingError = "current state";
  pending.reject(new Error("old private failure"));
  assert.equal(await result, null);
  assert.equal(state.onboardingError, "current state");
});
