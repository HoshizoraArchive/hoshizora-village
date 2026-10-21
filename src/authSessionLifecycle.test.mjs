import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";
import { AUTH_CONFIRMATION_KIND, AUTH_PASSWORD_RECOVERY_KIND, getSanitizedAuthCallbackPath } from "./authConfirmation.js";

const source = readFileSync(new URL("./hooks/useAuthSessionLifecycle.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const authHook = ast.program.body.find((node) => node.type === "ExportNamedDeclaration" && node.declaration?.id?.name === "useAuthSessionLifecycle")?.declaration;
assert.ok(authHook);
const effect = authHook.body.body.find((node) => node.type === "ExpressionStatement" && node.expression.callee.name === "useEffect");
assert.ok(effect, "auth lifecycle must install its useEffect");
const effectCode = source.slice(effect.start, effect.end);
const callback = effect.expression.arguments[0];
const callbackCode = source.slice(callback.start, callback.end);

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function createAuthHarness({ kind = "normal", shouldCleanUrl = false, session = null, pending = null, error = null } = {}) {
  const state = { messages: [], unsubscribeCount: 0, replaceHistory: [], clearTimeouts: [], timeouts: [], updates: [], authUserId: null };
  let authListener;
  const response = pending?.promise ?? Promise.resolve({ data: { session }, error });
  const location = { hash: "", pathname: "/auth/recovery", search: "" };
  const fakeWindow = {
    location,
    history: { state: null, replaceState: (_state, _title, path) => state.replaceHistory.push(path) },
    setTimeout: (fn, delay) => { state.timeouts.push({ fn, delay }); return state.timeouts.length; },
    clearTimeout: (id) => state.clearTimeouts.push(id),
  };
  const activeSessionUserIdRef = { current: null };
  const env = {
    window: fakeWindow,
    initialAuthCallback: { kind, shouldCleanUrl },
    authCallbackCleanedRef: { current: false },
    authCallbackResolvedRef: { current: false },
    passwordRecoveryVerifiedUserIdRef: { current: null },
    activeSessionUserIdRef,
    setSession: (value) => { state.session = value; state.authUserId = value?.user?.id ?? null; state.updates.push("session"); },
    setAuthConfirmation: (value) => { state.confirmation = value; },
    setAuthError: (value) => { state.authError = value; },
    setAuthMessage: (value) => { state.authMessage = value; },
    setPasswordRecovery: (value) => { state.passwordRecovery = value; },
    setAuthStatus: (value) => { state.authStatus = value; },
    AUTH_CONFIRMATION_KIND,
    AUTH_PASSWORD_RECOVERY_KIND,
    getSanitizedAuthCallbackPath,
    ERROR_OPERATION: { AUTH_SESSION: "session" },
    getUserFacingError: () => "確認できませんでした",
    supabase: {
      auth: {
        getSession: () => response,
        onAuthStateChange: (listener) => {
          authListener = listener;
          return { data: { subscription: { unsubscribe: () => { state.unsubscribeCount += 1; } } } };
        },
      },
    },
  };
  const effectFactory = new Function(...Object.keys(env), 'return (' + callbackCode + ');');
  const cleanup = effectFactory(...Object.values(env))();
  return { state, env, emit: (event, value) => authListener(event, value), cleanup };
}

test("Auth effect contains the audited latest-event-wins guard", () => {
  assert.equal(createHash("sha256").update(effectCode).digest("hex"), "fda8f3fecc7523b500c2af8092e2e396c170ae94bc2820e39e7ee7abb8012af0");
  assert.match(effectCode, /if \(hasAuthStateEvent\) \{[\s\S]*?applyInitialAuthCallback\(latestAuthStateEventSession\);/);
  assert.match(effectCode, /latestAuthStateEventType = event;[\s\S]*?latestAuthStateEventSession = session;/);
  assert.deepEqual(effect.expression.arguments[1].elements.map((entry) => source.slice(entry.start, entry.end)), [
    "initialAuthCallback.kind", "initialAuthCallback.shouldCleanUrl",
  ]);
});

test("App installs lifecycle hook in the former Auth effect slot and keeps session ownership", () => {
  assert.match(appSource, /import \{ useAuthSessionLifecycle \} from "\.\/hooks\/useAuthSessionLifecycle\.js"/);
  const appIndex = appSource.indexOf("function App()");
  const hookIndex = appSource.indexOf("useAuthSessionLifecycle({", appIndex);
  assert.ok(hookIndex > appIndex);
  assert.ok(hookIndex > appSource.indexOf("const [initialAuthCallback]", appIndex));
  assert.ok(hookIndex < appSource.indexOf("activeSessionUserIdRef.current = session?.user?.id", hookIndex));
  for (const name of ["initialAuthCallback", "authCallbackResolvedRef", "passwordRecoveryVerifiedUserIdRef", "setAuthStatus", "setSession", "activeSessionUserIdRef"]) {
    assert.ok(appSource.slice(hookIndex, hookIndex + 420).includes(name), "missing dependency: " + name);
  }
});

test("normal Auth session bootstraps and listener unsubscribe happens on cleanup", async () => {
  const session = { user: { id: "A", email: "a@example.invalid" } };
  const app = createAuthHarness({ session });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.session, session);
  assert.equal(app.env.activeSessionUserIdRef.current, "A");
  assert.equal(app.state.authStatus, "ログイン中");
  app.emit("SIGNED_OUT", null);
  assert.equal(app.state.authStatus, "未ログイン");
  assert.equal(app.state.session, null);
  app.cleanup();
  assert.equal(app.state.unsubscribeCount, 1);
});

test("signup confirmation callback is resolved only once and sanitizes URL", async () => {
  const session = { user: { id: "A", email: "a@example.invalid" } };
  const app = createAuthHarness({ kind: "signup_callback", shouldCleanUrl: true, session });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.confirmation.kind, AUTH_CONFIRMATION_KIND.CONFIRMED);
  assert.equal(app.env.authCallbackResolvedRef.current, true);
  assert.equal(app.state.replaceHistory.length, 1);
  app.emit("SIGNED_IN", session);
  assert.equal(app.state.replaceHistory.length, 1, "SIGNED_IN must not process callback again");
  app.cleanup();
});

test("PASSWORD_RECOVERY event alone activates a verified recovery session", async () => {
  const pending = deferred();
  const session = { user: { id: "recover-1", email: "r@example.invalid" } };
  const app = createAuthHarness({ kind: "password_recovery", shouldCleanUrl: true, pending });
  app.emit("PASSWORD_RECOVERY", session);
  assert.equal(app.state.passwordRecovery.kind, AUTH_PASSWORD_RECOVERY_KIND.ACTIVE);
  assert.equal(app.env.passwordRecoveryVerifiedUserIdRef.current, "recover-1");
  assert.equal(app.state.replaceHistory.length, 1);
  pending.resolve({ data: { session }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.passwordRecovery.kind, AUTH_PASSWORD_RECOVERY_KIND.ACTIVE);
  app.cleanup();
});

test("recovery pathname without verified event fails closed after grace period", async () => {
  const app = createAuthHarness({ kind: "password_recovery", shouldCleanUrl: true, session: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.timeouts.length, 1);
  assert.equal(app.state.timeouts[0].delay, 100);
  app.state.timeouts[0].fn();
  assert.equal(app.state.passwordRecovery.kind, AUTH_PASSWORD_RECOVERY_KIND.INVALID);
  assert.equal(app.state.authStatus, "再設定リンクエラー");
  app.cleanup();
});

test("late initial session must not overwrite a newer SIGNED_IN event", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  const userA = { user: { id: "A", email: "a@example.invalid" } };
  const userB = { user: { id: "B", email: "b@example.invalid" } };
  app.emit("SIGNED_IN", userB);
  pending.resolve({ data: { session: userA }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.env.activeSessionUserIdRef.current, "B");
  assert.equal(app.state.session, userB);
  assert.equal(app.state.authStatus, "ログイン中");
  app.cleanup();
});

test("late initial session must not resurrect login after SIGNED_OUT", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  app.emit("SIGNED_OUT", null);
  pending.resolve({ data: { session: { user: { id: "old-account" } } }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.env.activeSessionUserIdRef.current, null);
  assert.equal(app.state.session, null);
  assert.equal(app.state.authStatus, "未ログイン");
  app.cleanup();
});

test("new Auth INITIAL_SESSION takes priority over obsolete getSession and resolves signup callback", async () => {
  const pending = deferred();
  const latest = { user: { id: "confirmed", email: "confirmed@example.invalid" } };
  const app = createAuthHarness({ kind: "signup_callback", shouldCleanUrl: true, pending });
  app.emit("INITIAL_SESSION", latest);
  pending.resolve({ data: { session: null }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.session, latest);
  assert.equal(app.state.confirmation?.kind, AUTH_CONFIRMATION_KIND.CONFIRMED);
  assert.equal(app.state.replaceHistory.length, 1);
  app.cleanup();
});

test("an old getSession error must not invalidate verified PASSWORD_RECOVERY", async () => {
  const pending = deferred();
  const recovery = { user: { id: "recover-A", email: "recovery@example.invalid" } };
  const app = createAuthHarness({ kind: "password_recovery", shouldCleanUrl: true, pending });
  app.emit("PASSWORD_RECOVERY", recovery);
  pending.resolve({ data: { session: null }, error: { code: "session_not_found" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.passwordRecovery?.kind, AUTH_PASSWORD_RECOVERY_KIND.ACTIVE);
  assert.equal(app.env.passwordRecoveryVerifiedUserIdRef.current, "recover-A");
  assert.equal(app.state.authStatus, "パスワード再設定中");
  app.cleanup();
});

test("stale initial session error after new SIGNED_IN does not show auth error", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  const latest = { user: { id: "A" } };
  app.emit("SIGNED_IN", latest);
  pending.resolve({ data: { session: null }, error: { code: "not_found" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "ログイン中");
  assert.equal(app.state.authError, undefined);
  app.cleanup();
});

test("failed initial getSession is shown when SDK emits only INITIAL_SESSION(null)", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  app.emit("INITIAL_SESSION", null);
  pending.resolve({ data: { session: null }, error: { code: "network_failure" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "確認エラー");
  assert.equal(app.state.authError, "確認できませんでした");
  assert.equal(app.state.session, null);
  app.cleanup();
});

test("failed initial getSession invalidates unresolved recovery after only INITIAL_SESSION(null)", async () => {
  const pending = deferred();
  const app = createAuthHarness({ kind: "password_recovery", shouldCleanUrl: true, pending });
  app.emit("INITIAL_SESSION", null);
  pending.resolve({ data: { session: null }, error: { code: "session_not_found" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.passwordRecovery?.kind, AUTH_PASSWORD_RECOVERY_KIND.INVALID);
  assert.equal(app.state.authStatus, "再設定リンクエラー");
  assert.equal(app.state.replaceHistory.length, 1);
  app.cleanup();
});

test("successful initial anonymous state does not fabricate an error", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  app.emit("INITIAL_SESSION", null);
  pending.resolve({ data: { session: null }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "未ログイン");
  assert.equal(app.state.authError, undefined);
  app.cleanup();
});

test("new SIGNED_OUT after INITIAL_SESSION suppresses stale initial error", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  app.emit("INITIAL_SESSION", null);
  app.emit("SIGNED_OUT", null);
  pending.resolve({ data: { session: null }, error: { code: "network_failure" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "未ログイン");
  assert.equal(app.state.authError, undefined);
  app.cleanup();
});

test("new SIGNED_IN after INITIAL_SESSION suppresses stale initial error", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  const latest = { user: { id: "latest", email: "latest@example.invalid" } };
  app.emit("INITIAL_SESSION", null);
  app.emit("SIGNED_IN", latest);
  pending.resolve({ data: { session: null }, error: { code: "network_failure" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "ログイン中");
  assert.equal(app.state.authError, undefined);
  assert.equal(app.state.session, latest);
  app.cleanup();
});

test("INITIAL_SESSION with a valid account remains authoritative despite stale getSession error", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  const latest = { user: { id: "latest" } };
  app.emit("INITIAL_SESSION", latest);
  pending.resolve({ data: { session: null }, error: { code: "network_failure" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.authStatus, "ログイン中");
  assert.equal(app.state.authError, undefined);
  assert.equal(app.state.session, latest);
  app.cleanup();
});

test("unmounted lifecycle ignores late getSession responses and unsubscribes", async () => {
  const pending = deferred();
  const app = createAuthHarness({ pending });
  app.cleanup();
  pending.resolve({ data: { session: { user: { id: "stale" } } }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.state.session, undefined);
  assert.equal(app.state.unsubscribeCount, 1);
});
