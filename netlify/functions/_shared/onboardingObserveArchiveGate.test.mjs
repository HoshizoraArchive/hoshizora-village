import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const gateSource = readFileSync("src/onboardingObserveArchiveGate.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");
let moduleSequence = 0;

async function loadArchiveGate({ initiallyDisabled = false, initialStage = "resonance" } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  const animationFrames = [];
  const buttonAttributes = new Map();
  let disabled = initiallyDisabled;
  let disabledWrites = 0;
  let observerCallback = null;
  let stage = initialStage;

  const archiveButton = {
    textContent: "Archive",
    get disabled() {
      return disabled;
    },
    set disabled(value) {
      disabledWrites += 1;
      disabled = Boolean(value);
      observerCallback?.([]);
    },
    getAttribute(name) {
      return buttonAttributes.get(name) ?? null;
    },
    hasAttribute(name) {
      return buttonAttributes.has(name);
    },
    removeAttribute(name) {
      buttonAttributes.delete(name);
    },
    setAttribute(name, value) {
      buttonAttributes.set(name, String(value));
    },
  };
  const guide = {
    getAttribute(name) {
      return name === "data-onboarding-observe-stage" ? stage : null;
    },
  };
  const card = {
    querySelectorAll(selector) {
      return selector === "button" ? [archiveButton] : [];
    },
  };
  const documentStub = {
    documentElement: {},
    visibilityState: "visible",
    addEventListener() {},
    querySelector(selector) {
      if (selector === '.onboarding-guide[data-onboarding-step="archive_prompt"]') {
        return guide;
      }
      if (selector === '[data-onboarding-target="onboarding-archive-post"]') {
        return card;
      }
      return null;
    },
  };
  const windowStub = {
    addEventListener() {},
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
  };

  class MutationObserverStub {
    constructor(callback) {
      observerCallback = callback;
    }

    observe() {}
  }

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.MutationObserver = MutationObserverStub;

  const moduleUrl = pathToFileURL(resolve("src/onboardingObserveArchiveGate.js"));
  moduleUrl.searchParams.set("test", String(++moduleSequence));
  const gateModule = await import(moduleUrl.href);

  return {
    archiveButton,
    gateModule,
    getDisabledWrites: () => disabledWrites,
    flushAnimationFrames(limit = 10) {
      let processed = 0;
      while (animationFrames.length > 0 && processed < limit) {
        animationFrames.shift()();
        processed += 1;
      }
      return { pending: animationFrames.length, processed };
    },
    setStage(nextStage) {
      stage = nextStage;
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
    },
  };
}

test("共鳴と星文の案内が終わるまではArchiveを押せない", () => {
  for (const token of [
    'const shouldGate = stage !== "archive"',
    "archiveButton.disabled = true",
    'archiveButton.setAttribute(GATED_ATTRIBUTE, "true")',
    "restoreArchiveButton()",
  ]) {
    assert.equal(gateSource.includes(token), true, `missing archive gate behavior: ${token}`);
  }
});

test("ArchiveゲートをDB基準ガイドより先に読み込む", () => {
  const gateIndex = mainSource.indexOf('import "./onboardingObserveArchiveGate.js";');
  const experienceIndex = mainSource.indexOf('import "./onboardingObserveExperience.js";');

  assert.notEqual(gateIndex, -1);
  assert.notEqual(experienceIndex, -1);
  assert.equal(gateIndex < experienceIndex, true);
});

test("Archive禁止中の同一状態への再同期はdisabledを書き直さず自己再発火が止まる", async () => {
  const harness = await loadArchiveGate();

  try {
    const frames = harness.flushAnimationFrames();

    assert.equal(harness.archiveButton.disabled, true);
    assert.equal(harness.getDisabledWrites(), 1);
    assert.deepEqual(frames, { pending: 0, processed: 2 });

    harness.gateModule.synchronizeArchiveGate();
    assert.equal(harness.getDisabledWrites(), 1);
  } finally {
    harness.cleanup();
  }
});

test("Archive許可時は元のdisabled状態と異なる場合だけ復元する", async () => {
  const harness = await loadArchiveGate();

  try {
    harness.flushAnimationFrames();
    harness.setStage("archive");
    harness.gateModule.synchronizeArchiveGate();

    assert.equal(harness.archiveButton.disabled, false);
    assert.equal(harness.getDisabledWrites(), 2);

    harness.gateModule.synchronizeArchiveGate();
    assert.equal(harness.getDisabledWrites(), 2);
  } finally {
    harness.cleanup();
  }
});

test("元からdisabledのArchiveボタンはGate適用と復元で再代入しない", async () => {
  const harness = await loadArchiveGate({ initiallyDisabled: true });

  try {
    harness.flushAnimationFrames();
    harness.setStage("archive");
    harness.gateModule.synchronizeArchiveGate();

    assert.equal(harness.archiveButton.disabled, true);
    assert.equal(harness.getDisabledWrites(), 0);
  } finally {
    harness.cleanup();
  }
});
