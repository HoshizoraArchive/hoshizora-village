self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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

  event.waitUntil(self.registration.showNotification(title, options));
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
