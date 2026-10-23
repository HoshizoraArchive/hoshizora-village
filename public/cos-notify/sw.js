// direct-chat-link-v3: update without caching report bodies or bearer credentials.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  const allowed = ['completed','failed','cancelled','blocked','test'];
  const state = typeof data.body === 'string' ? data.body.replace(/^CoS: /,'') : '';
  const tag = /^[a-f0-9]{64}$/.test(data.tag || '') ? data.tag : 'cos-status';
  event.waitUntil(self.registration.showNotification('CoS 通知', { body: allowed.includes(state) ? 'CoS: ' + state : 'CoSの状態が更新されました', tag, icon: 'icon.svg', data: { url: self.registration.scope } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close(); const target = new URL(self.registration.scope);
  const key = /^[a-f0-9]{64}$/.test(event.notification.tag || '') ? event.notification.tag : '';
  if (key) target.hash = 'report-event=' + key;
  event.waitUntil((async () => {
    // A user-registered per-event link is stored in same-origin CacheStorage
    // and read only by this service worker. Do not use arbitrary push payload
    // URLs or route unrelated notification keys to a guessed chat.
    if (key && typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('cos-chat-links-v1');
        const saved = await cache.match(new URL('chat-link/' + key, self.registration.scope).href);
        if (saved) {
          const value = await saved.text(), url = new URL(value);
          const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
          const pattern = new RegExp('^/(?:c/' + uuid + '|g/g-p-[a-f0-9]{32}(?:-[a-z0-9-]+)?/c/' + uuid + ')$','i');
          if (url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.username && !url.password && !url.port && !url.search && !url.hash && pattern.test(url.pathname)) {
            // For cross-origin ChatGPT navigation the browser may open the
            // requested URL but return null because the new tab is not a
            // same-origin WindowClient. A null result is not a navigation
            // failure; opening the inbox as well would create two windows.
            await self.clients.openWindow(url.href);
            return;
          }
        }
      } catch { /* unsafe, unsupported or unavailable link: open authenticated inbox instead */ }
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) { const u = new URL(w.url); if (u.origin === target.origin && (u.pathname === target.pathname || u.pathname === target.pathname + 'index.html')) { if (key) { await w.navigate(target.href); } await w.focus(); return; } }
    await self.clients.openWindow(target.href);
  })());
});