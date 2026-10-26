// exact-origin-only-v6. Notification-tap handoff in memory, never origin-wide disk storage.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Remove obsolete global and per-event plaintext redirect caches when
  // upgrading the installed PWA; event links now live only in volatile memory.
  for (const name of ['cos-chat-links-v1','cos-chat-links-by-event-v1']) try { await caches.delete(name); } catch {}
  await self.clients.claim();
})()));
function chatUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 512) return '';
    const u = new URL(value);
    const valid = /^\/c\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    return u.protocol === 'https:' && u.hostname === 'chatgpt.com' && !u.username && !u.password && !u.port && !u.search && !u.hash && valid.test(u.pathname) ? u.href : '';
  } catch { return ''; }
}
const fresh = new Map();
function freshLink(key) {
  const row=fresh.get(key);
  if (!row || Date.now()-row.at > 2*60_000 || row.at > Date.now()+1000) { fresh.delete(key); return ''; }
  return row.url;
}
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  const allowed = ['completed','failed','cancelled','blocked','test'];
  const state = typeof data.body === 'string' ? data.body.replace(/^CoS: /,'') : '';
  const tag = /^[a-f0-9]{64}$/.test(data.tag || '') ? data.tag : 'cos-status';
  // The URL came from a per-notification CoS navigation hint, carried via
  // encrypted Web Push. It is NOT an execution authorization credential.
  const chat_url = tag === 'cos-status' ? '' : chatUrl(data.origin_chat_url);
  event.waitUntil(self.registration.showNotification('CoS 通知', { body: allowed.includes(state) ? 'CoS: ' + state : 'CoSの状態が更新されました', tag, icon: 'icon.svg', data: { origin_chat_url:chat_url, event_key:tag } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const key = /^[a-f0-9]{64}$/.test(event.notification.tag || '') ? event.notification.tag : '';
  const data=event.notification.data;
  const proven = key && data?.event_key===key ? chatUrl(data.origin_chat_url) : '';
  if (proven) {
    fresh.set(key,{url:proven,at:Date.now()});
    for(const k of fresh.keys()) if(!freshLink(k))fresh.delete(k);
    while(fresh.size>16) fresh.delete(fresh.keys().next().value);
  }
  // IMPORTANT: Invoke cross-origin openWindow directly within notificationclick
  // activation, before any asynchronous cache, storage, network or await.
  let opening=null;
  if(proven) try{opening=self.clients.openWindow(proven);}catch{}
  const target = new URL(self.registration.scope);
  if (key) target.hash = 'report-event=' + key;
  event.waitUntil((async () => {
    if (opening) try { await opening; return; } catch { /* Use the owned PWA inbox */ }
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const w of windows) {
      const u = new URL(w.url);
      if (u.origin === target.origin && (u.pathname === target.pathname || u.pathname === target.pathname + 'index.html')) {
        if (key) await w.navigate(target.href);
        await w.focus();
        // Keep the SW handoff alive while the authenticated inbox loads.
        if(proven) await new Promise(resolve=>setTimeout(resolve,6000));
        return;
      }
    }
    await self.clients.openWindow(target.href);
    if(proven) await new Promise(resolve=>setTimeout(resolve,6000));
  })());
});
self.addEventListener('message', event => {
  const client=event.source;
  if(!client || typeof client.url!=='string' || typeof client.postMessage!=='function')return;
  const origin=new URL(self.registration.scope);
  let url;
  try{url=new URL(client.url);}catch{return;}
  if(url.origin!==origin.origin || (url.pathname!==origin.pathname && url.pathname!==origin.pathname+'index.html'))return;
  if(event.data?.type==='cos-origin-clear'){fresh.clear();return;}
  if(event.data?.type!=='cos-origin-get')return;
  const key=event.data.event_key;
  if(typeof key!=='string' || !/^[a-f0-9]{64}$/.test(key))return;
  const value=freshLink(key);
  if(!value)return;
  fresh.delete(key);
  client.postMessage({type:'cos-origin-link',event_key:key,origin_chat_url:value});
});