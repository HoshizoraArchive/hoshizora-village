import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/onboardingObserveExperience.js", "utf8");
const executableSource = source.replace('import { supabase } from "./lib/supabaseClient";\n', "");

const ACTIVE_PROGRESS = {
  user_id: "user-1",
  current_step: "archive_prompt",
  target_post_id: "post-1",
  created_at: "2026-08-03T00:00:00.000Z",
};

function createPollingHarness({
  deferProgress = false,
  guideInitiallyPresent = true,
  initialVisibility = "visible",
  progress = ACTIVE_PROGRESS,
} = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousHtmlFormElement = globalThis.HTMLFormElement;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const intervals = [];
  const fromCalls = [];
  const pendingProgressReads = [];
  let guidePresent = guideInitiallyPresent;
  let visibilityState = initialVisibility;

  const guide = {
    getAttribute() {
      return null;
    },
    querySelector() {
      return null;
    },
    removeAttribute() {},
  };
  const documentStub = {
    documentElement: {},
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(type, listener) {
      documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]);
    },
    querySelector(selector) {
      return selector === '.onboarding-guide[data-onboarding-step="archive_prompt"]' && guidePresent
        ? guide
        : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const windowStub = {
    addEventListener(type, listener) {
      windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]);
    },
    clearTimeout() {},
    requestAnimationFrame() {
      return 1;
    },
    setInterval(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    setTimeout() {
      return 1;
    },
  };

  class MutationObserverStub {
    observe() {}
  }

  const supabase = {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: "user-1" } } } };
      },
    },
    from(table) {
      fromCalls.push(table);
      const builder = {
        eq() {
          return builder;
        },
        gte() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (!deferProgress) {
            return Promise.resolve({ data: progress, error: null });
          }
          return new Promise((resolveRead) => pendingProgressReads.push(resolveRead));
        },
        select() {
          return builder;
        },
      };
      return builder;
    },
  };

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.MutationObserver = MutationObserverStub;
  globalThis.HTMLFormElement = class HTMLFormElementStub {};

  new Function("supabase", executableSource)(supabase);

  return {
    dispatchDocumentEvent(type) {
      for (const listener of documentListeners.get(type) ?? []) {
        listener();
      }
    },
    getFromCallCount(table) {
      return fromCalls.filter((calledTable) => calledTable === table).length;
    },
    getTotalQueryCount() {
      return fromCalls.length;
    },
    getIntervalDelay() {
      return intervals[0]?.delay;
    },
    resolveNextProgress(nextProgress = progress) {
      const resolveRead = pendingProgressReads.shift();
      assert.ok(resolveRead, "expected a pending progress query");
      resolveRead({ data: nextProgress, error: null });
    },
    runInterval() {
      assert.equal(intervals.length, 1);
      intervals[0].callback();
    },
    setGuidePresent(nextGuidePresent) {
      guidePresent = nextGuidePresent;
    },
    setVisibility(nextVisibility) {
      visibilityState = nextVisibility;
    },
    cleanup() {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
      if (previousDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }
      if (previousMutationObserver === undefined) {
        delete globalThis.MutationObserver;
      } else {
        globalThis.MutationObserver = previousMutationObserver;
      }
      if (previousHtmlFormElement === undefined) {
        delete globalThis.HTMLFormElement;
      } else {
        globalThis.HTMLFormElement = previousHtmlFormElement;
      }
    },
  };
}

async function flushAsyncWork() {
  await new Promise((resolveFlush) => setImmediate(resolveFlush));
}

test("観測オンボーディングは表示中もDBを継続確認して段階を復元する", () => {
  for (const token of [
    "const DATABASE_REFRESH_INTERVAL_MS = 800",
    'window.setInterval(() => {',
    "requestContextSynchronization();",
    '.select("user_id, current_step, target_post_id, created_at")',
    '.gte("created_at", activeStartedAt)',
    'hasMatchingRow("resonances", "profile_id")',
    'hasMatchingRow("star_letters", "author_id")',
    'databaseStage === "star_letter_open"',
  ]) {
    assert.equal(source.includes(token), true, `missing DB-derived observe stage behavior: ${token}`);
  }
});

test("DOM再描画時も古い段階だけを貼り直さずDB再確認を予約する", () => {
  assert.equal(source.includes("Date.now() - lastContextReadAt >= MUTATION_REFRESH_THROTTLE_MS"), true);
  assert.equal(source.includes("requestContextSynchronization();"), true);
  assert.equal(source.includes("if (activeContextKey && getGuide())"), false);
  assert.equal(source.includes("applyObserveGuide();\n\n    if (Date.now()"), true);
});

test("再実行時はオンボーディング開始前の共鳴と星文を進行条件にしない", () => {
  assert.equal(source.includes("activeStartedAt = progress.created_at"), true);
  assert.equal(source.includes('.gte("created_at", activeStartedAt)'), true);
  assert.equal(source.includes('`${userId}:${progress.target_post_id}:${progress.created_at}`'), true);
});

test("Observe DB pollingは必要な表示状態だけでsingle-flight実行する", async (context) => {
  await context.test("guide表示中かつvisibleなら800ms間隔の更新確認を続ける", async () => {
    const harness = createPollingHarness();

    try {
      await flushAsyncWork();
      assert.equal(harness.getIntervalDelay(), 800);
      assert.equal(harness.getTotalQueryCount(), 3);

      harness.runInterval();
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 6);
    } finally {
      harness.cleanup();
    }
  });

  await context.test("hidden中はqueryせずvisible復帰時に再開する", async () => {
    const harness = createPollingHarness({ initialVisibility: "hidden" });

    try {
      await flushAsyncWork();
      harness.runInterval();
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 0);

      harness.setVisibility("visible");
      harness.dispatchDocumentEvent("visibilitychange");
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 3);
    } finally {
      harness.cleanup();
    }
  });

  await context.test("guide消失後はqueryを続けない", async () => {
    const harness = createPollingHarness();

    try {
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 3);

      harness.setGuidePresent(false);
      harness.runInterval();
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 3);
    } finally {
      harness.cleanup();
    }
  });

  await context.test("onboarding完了を確認したguideではqueryを続けない", async () => {
    const harness = createPollingHarness({
      progress: { ...ACTIVE_PROGRESS, current_step: "completed" },
    });

    try {
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 1);

      harness.runInterval();
      harness.runInterval();
      await flushAsyncWork();
      assert.equal(harness.getTotalQueryCount(), 1);
    } finally {
      harness.cleanup();
    }
  });

  await context.test("遅いquery中の複数pollは並列化せず次の1回だけをqueueする", async () => {
    const harness = createPollingHarness({ deferProgress: true });

    try {
      await flushAsyncWork();
      assert.equal(harness.getFromCallCount("user_onboarding_progress"), 1);

      for (let index = 0; index < 5; index += 1) {
        harness.runInterval();
      }
      await flushAsyncWork();
      assert.equal(harness.getFromCallCount("user_onboarding_progress"), 1);

      harness.resolveNextProgress();
      await flushAsyncWork();
      assert.equal(harness.getFromCallCount("user_onboarding_progress"), 2);

      harness.resolveNextProgress();
      await flushAsyncWork();
      assert.equal(harness.getFromCallCount("user_onboarding_progress"), 2);
      assert.equal(harness.getTotalQueryCount(), 6);
    } finally {
      harness.cleanup();
    }
  });
});
