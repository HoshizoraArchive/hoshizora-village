import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(appSource, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "App");
assert.ok(app, "App component must be available");
const handlers = new Map(app.body.body.filter((node) => node.type === "FunctionDeclaration").map((node) => [
  node.id.name, appSource.slice(node.start, node.end),
]));

function handler(name, env) {
  const source = handlers.get(name);
  assert.ok(source, name + " must remain a real App handler");
  return new Function(...Object.keys(env), "return (" + source + ");")(...Object.values(env));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeRuntime() {
  const runtime = { userId: "A", sessionKey: "A:1" };
  const captureDataMutationSession = (userId) => ({ userId, sessionKey: runtime.sessionKey });
  const isCurrentDataMutationSession = (captured) =>
    Boolean(captured && captured.userId === runtime.userId && captured.sessionKey === runtime.sessionKey);
  return { runtime, captureDataMutationSession, isCurrentDataMutationSession };
}

function createState(initial) {
  const state = { ...initial };
  const setters = new Proxy({}, {
    get(_target, name) {
      return (value) => {
        const key = String(name).replace(/^set/, "");
        const stateKey = key.charAt(0).toLowerCase() + key.slice(1);
        state[stateKey] = typeof value === "function" ? value(state[stateKey]) : value;
      };
    },
  });
  return { state, setters };
}

test("Black Hole A's late list cannot replace B's list after account switch", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ blackHoleItems: [], blackHoleItemsLoading: false, blackHoleError: "", profileBlockingAvailable: true });
  const pendingA = deferred();
  const pendingB = deferred();
  let call = 0;
  const requestVersion = { current: 0 };
  function forUser(userId) {
    return handler("refreshBlackHoleItems", {
      session: { user: { id: userId } }, profileBlockingAvailable: true,
      captureDataMutationSession: () => captureDataMutationSession(userId),
      isCurrentDataMutationSession,
      blackHoleItemsRequestVersionRef: requestVersion,
      readMyProfileBlocks: () => (++call === 1 ? pendingA.promise : pendingB.promise),
      supabase: {}, isMissingProfileBlocksSchemaError: () => false, logSafeError() {},
      setBlackHoleItems: setters.setBlackHoleItems,
      setBlackHoleItemsLoading: setters.setBlackHoleItemsLoading,
      setBlackHoleError: setters.setBlackHoleError,
      setProfileBlockingAvailable: setters.setProfileBlockingAvailable,
    });
  }
  const readA = forUser("A")();
  assert.equal(state.blackHoleItemsLoading, true);
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.blackHoleItems = []; state.blackHoleItemsLoading = false;
  const readB = forUser("B")();
  pendingB.resolve([{ blockedId: "B-block" }]);
  await readB;
  assert.deepEqual(state.blackHoleItems, [{ blockedId: "B-block" }]);
  pendingA.resolve([{ blockedId: "A-block" }]);
  await readA;
  assert.deepEqual(state.blackHoleItems, [{ blockedId: "B-block" }]);
  assert.equal(state.blackHoleItemsLoading, false);
});

test("Black Hole stale error cannot disable B's management or clear B's loading", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ blackHoleItems: [], blackHoleItemsLoading: false, blackHoleError: "", profileBlockingAvailable: true });
  const pending = deferred();
  const refresh = handler("refreshBlackHoleItems", {
    session: { user: { id: "A" } }, profileBlockingAvailable: true,
    captureDataMutationSession: () => captureDataMutationSession("A"),
    isCurrentDataMutationSession,
    blackHoleItemsRequestVersionRef: { current: 0 },
    readMyProfileBlocks: () => pending.promise, supabase: {},
    isMissingProfileBlocksSchemaError: () => true, logSafeError() {},
    setBlackHoleItems: setters.setBlackHoleItems,
    setBlackHoleItemsLoading: setters.setBlackHoleItemsLoading,
    setBlackHoleError: setters.setBlackHoleError,
    setProfileBlockingAvailable: setters.setProfileBlockingAvailable,
  });
  const read = refresh();
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.blackHoleItemsLoading = true;
  pending.reject(Object.assign(new Error("A schema unavailable"), { code: "42P01" }));
  await read;
  assert.equal(state.profileBlockingAvailable, true);
  assert.equal(state.blackHoleItemsLoading, true);
  assert.equal(state.blackHoleError, "");
});

test("two Black Hole reads in the same session use the latest request", async () => {
  const { isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ blackHoleItems: [], blackHoleItemsLoading: false, blackHoleError: "" });
  const first = deferred(); const second = deferred(); let calls = 0;
  const env = {
    session: { user: { id: "A" } }, profileBlockingAvailable: true,
    captureDataMutationSession: () => captureDataMutationSession("A"),
    isCurrentDataMutationSession, blackHoleItemsRequestVersionRef: { current: 0 },
    readMyProfileBlocks: () => (++calls === 1 ? first.promise : second.promise),
    supabase: {}, isMissingProfileBlocksSchemaError: () => false, logSafeError() {},
    setBlackHoleItems: setters.setBlackHoleItems,
    setBlackHoleItemsLoading: setters.setBlackHoleItemsLoading,
    setBlackHoleError: setters.setBlackHoleError,
    setProfileBlockingAvailable: setters.setProfileBlockingAvailable,
  };
  const refresh = handler("refreshBlackHoleItems", env);
  const read1 = refresh(); const read2 = refresh();
  second.resolve([{ blockedId: "newest" }]); await read2;
  first.resolve([{ blockedId: "old" }]); await read1;
  assert.deepEqual(state.blackHoleItems, [{ blockedId: "newest" }]);
  assert.equal(state.blackHoleItemsLoading, false);
});

test("A's completed report cannot overwrite B's report dialog or busy state", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ contentReportDialog: { targetId: "A-report" }, contentReportSaving: false, contentReportsAvailable: true });
  const a = deferred(), b = deferred();
  const flightA = { run: (perform) => perform() }, flightB = { run: (perform) => perform() };
  const singleFlightRef = { current: flightA };
  function submit(userId) {
    return handler("handleSubmitContentReport", {
      contentReportDialog: { targetId: userId + "-report", reason: "spam" },
      contentReportSaving: false, event: null, // event is passed to the handler call below
      validateContentReportInput: () => ({ valid: true }),
      captureDataMutationSession: () => captureDataMutationSession(userId),
      isCurrentDataMutationSession, contentReportSingleFlightRef: singleFlightRef,
      createContentReport: (_client, dialog) => {
        assert.equal(dialog.targetId, userId + "-report");
        return userId === "A" ? a.promise : b.promise;
      },
      supabase: {}, isMissingContentReportsSchemaError: () => false, logSafeError() {},
      CONTENT_REPORT_DUPLICATE_MESSAGE: "already", CONTENT_REPORT_SUCCESS_MESSAGE: "sent",
      CONTENT_REPORT_ERROR_MESSAGE: "failed", ERROR_OPERATION: { REPORT_SAVE: "report_save" },
      setContentReportSaving: setters.setContentReportSaving,
      setContentReportDialog: setters.setContentReportDialog,
      setContentReportsAvailable: setters.setContentReportsAvailable,
    });
  }
  const event = { preventDefault() {} };
  const aRun = submit("A")(event);
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.contentReportDialog = { targetId: "B-report" };
  state.contentReportSaving = false; singleFlightRef.current = flightB;
  const bRun = submit("B")(event);
  a.resolve({ outcome: "created" }); await aRun;
  assert.equal(state.contentReportDialog.targetId, "B-report");
  assert.equal(state.contentReportDialog.result, undefined);
  assert.equal(state.contentReportSaving, true);
  b.resolve({ outcome: "created" }); await bRun;
  assert.equal(state.contentReportDialog.result, "sent");
  assert.equal(state.contentReportSaving, false);
});

test("A's failed report cannot disable reports or mark B's report with A's error", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ contentReportDialog: { targetId: "A-report" }, contentReportSaving: false, contentReportsAvailable: true });
  const pending = deferred();
  const flight = { run: (perform) => perform() };
  const contentReportSingleFlightRef = { current: flight };
  const submit = handler("handleSubmitContentReport", {
    contentReportDialog: { targetId: "A-report", reason: "spam" },
    contentReportSaving: false,
    validateContentReportInput: () => ({ valid: true }),
    captureDataMutationSession: () => captureDataMutationSession("A"), isCurrentDataMutationSession,
    contentReportSingleFlightRef, createContentReport: () => pending.promise,
    supabase: {}, isMissingContentReportsSchemaError: () => true, logSafeError() {},
    CONTENT_REPORT_DUPLICATE_MESSAGE: "already", CONTENT_REPORT_SUCCESS_MESSAGE: "sent",
    CONTENT_REPORT_ERROR_MESSAGE: "failed", ERROR_OPERATION: { REPORT_SAVE: "report_save" },
    setContentReportSaving: setters.setContentReportSaving,
    setContentReportDialog: setters.setContentReportDialog,
    setContentReportsAvailable: setters.setContentReportsAvailable,
  });
  const promise = submit({ preventDefault() {} });
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.contentReportDialog = { targetId: "B-report" }; state.contentReportSaving = true;
  pending.reject(Object.assign(new Error("Old A schema"), { safeMessage: "Old A error" }));
  await promise;
  assert.equal(state.contentReportsAvailable, true);
  assert.deepEqual(state.contentReportDialog, { targetId: "B-report" });
  assert.equal(state.contentReportSaving, true);
});

test("A's feedback result cannot clear B's draft or leave A's status in B's view", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ feedbackBody: "A draft", feedbackMessage: "", feedbackError: "", feedbackSaving: false });
  const pending = deferred();
  let inserted;
  const submit = handler("handleFeedbackSubmit", {
    session: { user: { id: "A" } }, feedbackBody: "A draft", feedbackType: "不具合",
    captureDataMutationSession: () => captureDataMutationSession("A"), isCurrentDataMutationSession,
    FEEDBACK_MAX_LENGTH: 1000, getTrimmedCharacterLength: (s) => s.length,
    supabase: { from: (table) => {
      assert.equal(table, "feedbacks");
      return { insert: (row) => { inserted = row; return pending.promise; } };
    } },
    ERROR_OPERATION: { FEEDBACK_SAVE: "feedback_save" }, getUserFacingError: () => "A failed",
    setFeedbackMessage: setters.setFeedbackMessage, setFeedbackError: setters.setFeedbackError,
    setFeedbackBody: setters.setFeedbackBody, setFeedbackSaving: setters.setFeedbackSaving,
  });
  const promise = submit({ preventDefault() {} });
  assert.equal(inserted.user_id, "A");
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.feedbackBody = "B draft"; state.feedbackSaving = true;
  pending.resolve({ error: null }); await promise;
  assert.equal(state.feedbackBody, "B draft");
  assert.equal(state.feedbackMessage, "");
  assert.equal(state.feedbackSaving, true);
});

test("A's failed feedback cannot display its error or unset B's saving status", async () => {
  const { runtime, isCurrentDataMutationSession, captureDataMutationSession } = makeRuntime();
  const { state, setters } = createState({ feedbackBody: "B private draft", feedbackMessage: "", feedbackError: "", feedbackSaving: false });
  const pending = deferred();
  const submit = handler("handleFeedbackSubmit", {
    session: { user: { id: "A" } }, feedbackBody: "A draft", feedbackType: "不具合",
    captureDataMutationSession: () => captureDataMutationSession("A"), isCurrentDataMutationSession,
    FEEDBACK_MAX_LENGTH: 1000, getTrimmedCharacterLength: (s) => s.length,
    supabase: { from: () => ({ insert: () => pending.promise }) },
    ERROR_OPERATION: { FEEDBACK_SAVE: "feedback_save" },
    getUserFacingError: () => "A's expired-session error",
    setFeedbackMessage: setters.setFeedbackMessage, setFeedbackError: setters.setFeedbackError,
    setFeedbackBody: setters.setFeedbackBody, setFeedbackSaving: setters.setFeedbackSaving,
  });
  const promise = submit({ preventDefault() {} });
  runtime.userId = "B"; runtime.sessionKey = "B:2";
  state.feedbackSaving = true;
  pending.resolve({ error: { code: "42501" } });
  await promise;
  assert.equal(state.feedbackError, "");
  assert.equal(state.feedbackSaving, true);
  assert.equal(state.feedbackBody, "B private draft");
});

test("feedback and report forms reset on Auth account switch", () => {
  const authReset = appSource.slice(appSource.indexOf("previousDataSessionUserIdRef.current = sessionUserId"), appSource.indexOf("}, [sessionUserId]);", appSource.indexOf("previousDataSessionUserIdRef.current = sessionUserId")));
  for (const name of ["setFeedbackBody", "setFeedbackSaving", "setFeedbackError", "setFeedbackMessage"]) {
    assert.match(authReset, new RegExp(name + "\\("), name + " must reset with the account");
  }
});
