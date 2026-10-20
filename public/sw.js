self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const PUSH_DEDUPE_DB = "hoshizora-push-dedupe";
const PUSH_DEDUPE_STORE = "notifications";
const PUSH_DEDUPE_LIMIT = 500;
const PUSH_DEDUPE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function openPushDedupeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_DEDUPE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_DEDUPE_STORE)) {
        request.result.createObjectStore(PUSH_DEDUPE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("push_dedupe_open_failed"));
  });
}

async function claimPushNotificationId(notificationId) {
  if (typeof notificationId !== "string" || !notificationId.trim() || notificationId.length > 256) {
    return false;
  }

  const database = await openPushDedupeDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PUSH_DEDUPE_STORE, "readwrite");
      const store = transaction.objectStore(PUSH_DEDUPE_STORE);
      let duplicate = false;
      let result = false;
      const existingRequest = store.get(notificationId);
      existingRequest.onsuccess = () => {
        if (existingRequest.result) {
          if (Number.isFinite(existingRequest.result.seenAt) && Date.now() - existingRequest.result.seenAt < PUSH_DEDUPE_MAX_AGE_MS) {
            duplicate = true;
            return;
          }
          store.delete(notificationId);
        }

        const allRequest = store.getAll();
        allRequest.onsuccess = () => {
          const now = Date.now();
          const validEntries = allRequest.result
            .filter((entry) => Number.isFinite(entry.seenAt) && now - entry.seenAt < PUSH_DEDUPE_MAX_AGE_MS)
            .sort((left, right) => left.seenAt - right.seenAt);
          for (const entry of allRequest.result) {
            if (!validEntries.includes(entry)) store.delete(entry.id);
          }
          while (validEntries.length >= PUSH_DEDUPE_LIMIT) {
            store.delete(validEntries.shift().id);
          }
          store.add({ id: notificationId, seenAt: now });
          result = true;
        };
      };
      transaction.oncomplete = () => resolve(!duplicate && result);
      transaction.onerror = () => reject(transaction.error || new Error("push_dedupe_transaction_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("push_dedupe_transaction_aborted"));
    });
  } finally {
    database.close();
  }
}

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {
      body: event.data?.text() ?? "星空Villageに新しい通知があります。",
    };
  }

  const title = payload.title || "星空Village";
  const payloadData = payload.data && typeof payload.data === "object" ? payload.data : {};
  const options = {
    body: payload.body || "Re:Connectに新しい通知があります。",
    icon: payload.icon || "/images/icons/hoshizora-village-icon-192.png",
    badge: payload.badge || "/images/icons/favicon-32.png",
    data: {
      ...payloadData,
      url: payloadData.url || payload.url || "/",
    },
  };

  const notificationId = payload.notificationId ?? payloadData.notificationId;
  const hasStableNotificationId = typeof notificationId === "string"
    && notificationId.trim().length > 0
    && notificationId.length <= 256;
  event.waitUntil((async () => {
    if (hasStableNotificationId && !(await claimPushNotificationId(notificationId))) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
