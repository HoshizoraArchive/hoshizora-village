import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "App");
const reset = app.body.body.find((node) =>
  node.type === "ExpressionStatement" &&
  node.expression.callee?.name === "useEffect" &&
  source.slice(node.start, node.end).includes("previousResetAuthIdentityEpochRef.current === authIdentityEpoch")
);
assert.ok(reset, "session reset effect must depend on the Auth identity epoch");
const resetCallback = source.slice(reset.expression.arguments[0].start, reset.expression.arguments[0].end);

function createHarness({ previousUserId, userId, previousEpoch, epoch }) {
  const beginSessionKeys = [];
  const calls = {};
  const refs = {
    sessionUserId: userId,
    authIdentityEpoch: epoch,
    previousDataSessionUserIdRef: { current: previousUserId },
    previousResetAuthIdentityEpochRef: { current: previousEpoch },
    dataSessionEpochRef: { current: 4 },
    dataSessionKeyRef: { current: userId + ":4" },
    publicPostsRefreshQueueRef: { current: { pendingOperation: {}, activeController: null } },
    publicPostsRefreshInFlightRef: { current: true },
    FEEDBACK_TYPES: ["不具合", "改善案"],
    Set,
    Map,
  };
  for (const refName of [
    "postContentRevisionsRef", "postAssetsRevisionsRef", "resonanceRevisionsRef",
    "archiveRevisionsRef", "starThreadRevisionsRef",
  ]) {
    refs[refName] = { current: { beginSession: (key) => beginSessionKeys.push({ refName, key }) } };
  }
  for (const refName of [
    "resonanceRequestVersionsRef", "starLetterRequestVersionsRef",
    "resonanceCountsByPostRef", "locallyCreatedPostIdsRef", "canonicalPostsByIdRef",
    "publicTimelineKnownPostIdsRef",
  ]) {
    refs[refName] = { current: { clear: () => {} } };
  }
  const context = new Proxy(refs, {
    has: () => true,
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key];
      if (typeof key === "string" && key.endsWith("Ref")) {
        return (target[key] = { current: null });
      }
      if (typeof key === "string" && key.startsWith("set")) {
        return (value) => {
          calls[key] = (calls[key] ?? 0) + 1;
          if (typeof value === "function") value(0);
        };
      }
      return () => {};
    },
  });
  const effect = new Function("context", "with (context) { return (" + resetCallback + "); }")(context);
  return { run: effect, refs, calls, beginSessionKeys };
}

test("A→B→A batched without intermediate render still resets all revision stores", () => {
  // Previous reset ran for A at epoch 1; Auth events advanced A→B→A to epoch 3,
  // and dataSessionKeyRef was invalidated synchronously before this render.
  const { run, refs, calls, beginSessionKeys } = createHarness({
    previousUserId: "A", userId: "A", previousEpoch: 1, epoch: 3,
  });
  run();
  assert.equal(refs.previousDataSessionUserIdRef.current, "A");
  assert.equal(refs.previousResetAuthIdentityEpochRef.current, 3);
  assert.equal(refs.dataSessionKeyRef.current, "A:5");
  assert.equal(beginSessionKeys.length, 5);
  assert.ok(beginSessionKeys.every((entry) => entry.key === "A:5"));
  assert.equal(calls.setFeedbackBody, 1);
  assert.equal(calls.setSavedPosts, 1);
  assert.equal(calls.setServerDataRevision, 1);
  run();
  assert.equal(refs.dataSessionKeyRef.current, "A:5");
  assert.equal(beginSessionKeys.length, 5, "same auth epoch must not double reset");
});

test("ordinary A→B render and initial anonymous render both reset once", () => {
  for (const { previousUserId, userId, previousEpoch, epoch } of [
    { previousUserId: "A", userId: "B", previousEpoch: 2, epoch: 3 },
    { previousUserId: undefined, userId: null, previousEpoch: undefined, epoch: 0 },
  ]) {
    const { run, refs, beginSessionKeys } = createHarness({ previousUserId, userId, previousEpoch, epoch });
    run();
    assert.equal(beginSessionKeys.length, 5);
    assert.equal(refs.previousDataSessionUserIdRef.current, userId);
    assert.equal(refs.previousResetAuthIdentityEpochRef.current, epoch);
    run();
    assert.equal(beginSessionKeys.length, 5);
  }
});

test("reset effect dependency array includes user ID and Auth identity epoch", () => {
  const dependencies = reset.expression.arguments[1].elements.map((entry) => source.slice(entry.start, entry.end));
  assert.deepEqual(dependencies, ["sessionUserId", "authIdentityEpoch"]);
});
