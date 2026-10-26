// exact-origin-only-v5. Per-event local fallback, never blanket redirect or guessed chat.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Delete obsolete user-entered blanket redirects. Earlier versions could
  // route every unrelated Dot back to one conversation, which is unsafe.
  try { await caches.delete('cos-chat-links-v1'); } catch {}
  await self.clients.claim();
})()));
function chatUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 512) return '';
    const u = new URL(value);
    const conversation = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
    const valid = new RegExp('^/c/' + conversation + '$','i');
    return u.protocol === 'https:' && u.hostname === 'chatgpt.com' && !u.username && !u.password && !u.port && !u.search && !u.hash && valid.test(u.pathname) ? u.href : '';
  } catch { return ''; }
}
const eventLinkCache = 'cos-chat-links-by-event-v1';
async function rememberExactEventLink(key,chat) {
  if (!/^[a-f0-9]{64}$/.test(key)) return;
  try {
    const cache = await caches.open(eventLinkCache);
    const resource = new URL('origin/' + key, self.registration.scope).href;
    if (!chat) { await cache.delete(resource); return; }
    await cache.put(resource, new Response(JSON.stringify({event_key:key,origin_chat_url:chat,at:Date.now()}),
      {headers:{'content-type':'application/json'}}));
    // No all-events/last-used link: at most 64 per-event records; PWA refuses links older than seven days.
    const keys = await cache.keys();
    for (const keyReq of keys.slice(0,Math.max(0,keys.length-64))) await cache.delete(keyReq);
  } catch { /* Cache unavailable: direct push still works, fallback remains inbox */ }
}
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  const allowed = ['completed','failed','cancelled','blocked','test'];
  const state = typeof data.body === 'string' ? data.body.replace(/^CoS: /,'') : '';
  const tag = /^[a-f0-9]{64}$/.test(data.tag || '') ? data.tag : 'cos-status';
  // The URL is a per-event CoS owner notification hint from exact history
  // matching or verified browser attribution, carried via encrypted Web Push.
  // It is never an execution/approval grant. Never show it on the lock screen.
  const chat_url = tag === 'cos-status' ? '' : chatUrl(data.origin_chat_url);
  event.waitUntil(Promise.all([
    self.registration.showNotification('CoS 通知', { body: allowed.includes(state) ? 'CoS: ' + state : 'CoSの状態が更新されました', tag, icon: 'icon.svg', data: { origin_chat_url:chat_url, event_key:tag } }),
    rememberExactEventLink(tag,chat_url)
  ]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(self.registration.scope);
  const key = /^[a-f0-9]{64}$/.test(event.notification.tag || '') ? event.notification.tag : '';
  if (key) target.hash = 'report-event=' + key;
  event.waitUntil((async () => {
    const data = event.notification.data;
    const proven = key && data?.event_key === key ? chatUrl(data.origin_chat_url) : '';
    if (proven) {
      // Also migrate still-visible notifications issued before this version;
      // their encrypted, previously captured notification.data remains keyed.
      await rememberExactEventLink(key,proven);
      try { await self.clients.openWindow(proven); return; }
      catch { /* unsupported universal link: use the authenticated inbox */ }
    }
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const w of windows) {
      const u = new URL(w.url);
      if (u.origin === target.origin && (u.pathname === target.pathname || u.pathname === target.pathname + 'index.html')) {
        if (key) await w.navigate(target.href);
        await w.focus(); return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});