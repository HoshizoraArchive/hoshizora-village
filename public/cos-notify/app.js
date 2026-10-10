(() => {
  'use strict';
  const API = "https://dhfecpymvmursozfgjlr.supabase.co/functions/v1/cos-notify/";
  const status = document.getElementById('status');
  const pairInput = document.getElementById('pair');
  let invite = '';
  const hex = a => [...a].map(x => x.toString(16).padStart(2, '0')).join('');
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function fromLink(value) {
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.search) return ''; const t = new URLSearchParams(u.hash.slice(1)).get('pair'); return /^[a-f0-9]{64}$/.test(t || '') ? t : ''; } catch { return ''; }
  }
  if (location.hash) { invite = fromLink(location.href); history.replaceState(null, '', location.pathname); }
  async function call(route, method='GET', body, authenticated=false) {
    const headers = {}; if (body) headers['Content-Type'] = 'application/json';
    if (authenticated) { const secret = localStorage.getItem('cos-device'); if (!secret) throw Error('未接続'); headers.Authorization = 'Bearer ' + secret; }
    const res = await fetch(API + route, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const value = await res.json(); if (!res.ok) throw Error(value.error || '接続できません'); return value;
  }
  function showState() { status.textContent = !navigator.onLine ? 'オフライン' : !installed() ? 'ホーム画面から開いてください' : !('PushManager' in window) ? 'この端末では通知を利用できません' : '通知許可: ' + Notification.permission + (localStorage.getItem('cos-paired') ? ' / 接続済み' : ' / 未接続'); }
  async function inbox() {
    const rows = (await call('inbox', 'GET', undefined, true)).events;
    const list = document.getElementById('inbox'); list.replaceChildren();
    for (const row of rows) { const li = document.createElement('li'); li.textContent = row.title + ' — ' + row.state + ' (' + new Date(row.created_at).toLocaleString('ja-JP') + ')'; list.append(li); }
    if (!rows.length) { const li = document.createElement('li'); li.textContent = 'まだ通知はありません'; list.append(li); }
  }
  async function connect() {
    if (!installed()) throw Error('先にホーム画面に追加し、追加したアプリから開いてください');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw Error('Web Push非対応です');
    invite = fromLink(pairInput.value) || invite;
    if (!invite && !localStorage.getItem('cos-device')) throw Error('Macで発行したペアURLが必要です');
    // Permission is requested directly in the user gesture, before asynchronous network work.
    const permission = await Notification.requestPermission(); if (permission !== 'granted') throw Error('通知が許可されていません');
    const registration = await navigator.serviceWorker.register('sw.js', { scope: './' }); await navigator.serviceWorker.ready;
    const key = (await call('vapid-public')).public_key;
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-key.length%4)%4));
    const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
    let secret = localStorage.getItem('cos-device');
    if (!secret) { secret = hex(crypto.getRandomValues(new Uint8Array(32))); localStorage.setItem('cos-device', secret); }
    if (invite) await call('subscribe', 'POST', { invite, device_secret: secret, subscription: sub.toJSON() });
    else await call('refresh-device', 'POST', { subscription: sub.toJSON() }, true);
    invite = ''; pairInput.value = ''; localStorage.setItem('cos-paired', '1'); showState(); await inbox();
  }
  async function action(fn) { try { await fn(); } catch(e) { const codes = ['unauthorized','pair_refused','device_limit','rate_limited','credential_or_endpoint_conflict']; status.textContent = codes.includes(e.message) ? '接続を確認してください: ' + e.message : '操作できません: ' + (e.message || '接続エラー').slice(0, 120); } }
  document.getElementById('connect').addEventListener('click', () => action(connect));
  document.getElementById('refresh').addEventListener('click', () => action(inbox));
  document.getElementById('revoke').addEventListener('click', () => action(async () => { await call('revoke-self', 'POST', {}, true); const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); localStorage.removeItem('cos-device'); localStorage.removeItem('cos-paired'); document.getElementById('inbox').replaceChildren(); showState(); }));
  addEventListener('online', showState); addEventListener('offline', showState); showState();
  if (installed() && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { status.textContent='Service Workerを登録できません'; });
  if (localStorage.getItem('cos-paired')) action(inbox);
})();