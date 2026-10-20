import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");

function createIndexedDB({ failOpen = false, failTransaction = false } = {}) {
  const databases = new Map();
  let transactionTail = Promise.resolve();

  return {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        if (failOpen) {
          request.error = new Error("IndexedDB unavailable");
          request.onerror?.();
          return;
        }
        let database = databases.get(name);
        const isNew = !database;
        if (!database) {
          database = { stores: new Map() };
          databases.set(name, database);
        }
        request.result = {
          objectStoreNames: { contains: (storeName) => database.stores.has(storeName) },
          createObjectStore(storeName) { database.stores.set(storeName, new Map()); },
          close() {},
          transaction(storeName) {
            const transaction = { error: null };
            const operations = [];
            const start = transactionTail;
            let finish;
            transactionTail = new Promise((resolve) => { finish = resolve; });
            start.then(() => {
              if (failTransaction) {
                transaction.error = new Error("IndexedDB transaction failed");
                transaction.onabort?.();
                finish();
                return;
              }
              const store = database.stores.get(storeName);
              for (const operation of operations) operation(store);
              queueMicrotask(() => {
                transaction.oncomplete?.();
                finish();
              });
            });
            transaction.objectStore = () => ({
              get(key) {
                const result = { result: undefined };
                operations.push((store) => {
                  result.result = store.get(key);
                  result.onsuccess?.();
                });
                return result;
              },
              getAll() {
                const result = { result: [] };
                operations.push((store) => {
                  result.result = [...store.values()];
                  result.onsuccess?.();
                });
                return result;
              },
              add(value) {
                const result = {};
                operations.push((store) => {
                  if (store.has(value.id)) {
                    transaction.error = new Error("ConstraintError");
                    transaction.onabort?.();
                  } else {
                    store.set(value.id, value);
                    result.onsuccess?.();
                  }
                });
                return result;
              },
              delete(key) { operations.push((store) => store.delete(key)); },
            });
            return transaction;
          },
        };
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function createWorker({ indexedDB = createIndexedDB(), clock = { now: 1_800_000_000_000 }, showNotification } = {}) {
  const listeners = new Map();
  const shown = [];
  const context = {
    indexedDB,
    URL,
    Promise,
    Date: { now: () => clock.now },
    self: {
      location: { origin: "https://village.example" },
      addEventListener: (name, listener) => listeners.set(name, listener),
      registration: {
        showNotification: async (title, options) => {
          if (showNotification) return showNotification(title, options, shown);
          shown.push({ title, options });
        },
      },
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
      skipWaiting: async () => {},
    },
  };
  vm.runInNewContext(serviceWorkerSource, context, { filename: "public/sw.js" });
  return {
    shown,
    async push(payload) {
      let completion;
      listeners.get("push")({
        data: { json: () => payload },
        waitUntil: (promise) => { completion = promise; },
      });
      await completion;
    },
  };
}

test("stable ID remains deduped across service worker restart and notification dismissal", async () => {
  const indexedDB = createIndexedDB();
  const clock = { now: 1_800_000_000_000 };
  const firstWorker = createWorker({ indexedDB, clock });
  const payload = { title: "Star letter", body: "Hello", data: { notificationId: "n-1" } };
  await firstWorker.push(payload);
  assert.equal(firstWorker.shown.length, 1);

  // Dismiss the visible item and construct a fresh worker global with the same browser storage.
  firstWorker.shown.length = 0;
  const restartedWorker = createWorker({ indexedDB, clock });
  await restartedWorker.push(payload);
  assert.equal(restartedWorker.shown.length, 0);
});

test("concurrent retries show a stable notification once while payloads without IDs retain legacy behavior", async () => {
  const worker = createWorker();
  const payload = { title: "Star letter", body: "Hello", notificationId: "n-2" };
  await Promise.all([worker.push(payload), worker.push(payload), worker.push(payload)]);
  await worker.push({ title: "Legacy", body: "No stable identifier" });
  await worker.push({ title: "Legacy", body: "No stable identifier" });
  assert.deepEqual(worker.shown.map(({ title }) => title), ["Star letter", "Legacy", "Legacy"]);
});

test("invalid stable IDs retain legacy display behavior", async () => {
  const worker = createWorker();
  for (const notificationId of [0, {}, "", "  ", "x".repeat(257)]) {
    const payload = { title: "Legacy", notificationId };
    await worker.push(payload);
    await worker.push(payload);
  }
  assert.equal(worker.shown.length, 10);
});

test("bounded history evicts its oldest ID when full", async () => {
  const worker = createWorker();
  for (let index = 0; index <= 500; index += 1) {
    await worker.push({ data: { notificationId: `n-${index}` } });
  }
  await worker.push({ data: { notificationId: "n-0" } });
  assert.equal(worker.shown.length, 502);
});

test("dedupe history evicts IDs after 30 days", async () => {
  const clock = { now: 1_800_000_000_000 };
  const worker = createWorker({ clock });
  const payload = { data: { notificationId: "aged-id" } };
  await worker.push(payload);
  await worker.push(payload);
  clock.now += 31 * 24 * 60 * 60 * 1000;
  await worker.push(payload);
  assert.equal(worker.shown.length, 2);
});

test("IndexedDB open and transaction failures fail closed", async () => {
  for (const indexedDB of [createIndexedDB({ failOpen: true }), createIndexedDB({ failTransaction: true })]) {
    const worker = createWorker({ indexedDB });
    await assert.rejects(worker.push({ notificationId: "must-not-appear" }));
    assert.equal(worker.shown.length, 0);
  }
});

test("a showNotification failure does not allow the same stable ID to display again", async () => {
  let attempts = 0;
  const indexedDB = createIndexedDB();
  const clock = { now: 1_800_000_000_000 };
  const failingWorker = createWorker({
    indexedDB,
    clock,
    showNotification: async () => {
      attempts += 1;
      throw new Error("display failed");
    },
  });
  const payload = { data: { notificationId: "claimed-before-display" } };
  await assert.rejects(failingWorker.push(payload));

  const restartedWorker = createWorker({ indexedDB, clock });
  await restartedWorker.push(payload);
  assert.equal(attempts, 1);
  assert.equal(restartedWorker.shown.length, 0);
});
