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
  event.waitUntil((async () => { const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); for (const w of windows) { const u = new URL(w.url); if (u.origin === target.origin && u.pathname === target.pathname) { await w.focus(); return; } } await self.clients.openWindow(target.href); })());
});