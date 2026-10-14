(() => {
  'use strict';
  const API = "https://dhfecpymvmursozfgjlr.supabase.co/functions/v1/cos-notify/";
  const status = document.getElementById('status');
  const pairInput = document.getElementById('pair');
  let invite = '', pendingEvent = '', currentReport = null, viewEpoch = 0, inboxEpoch = 0;
  let rowsByKey = new Map();
  const reportView = document.getElementById('report-view');
  const reportText = document.getElementById('report-text');
  const reportStatus = document.getElementById('report-status');
  const reportRetry = document.getElementById('report-retry');
  const opaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  function deepLink() { const value = new URLSearchParams(location.hash.slice(1)).get('report-event'); return opaque(value) ? value : ''; }
  const hex = a => [...a].map(x => x.toString(16).padStart(2, '0')).join('');
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function fromLink(value) {
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.search) return ''; const t = new URLSearchParams(u.hash.slice(1)).get('pair'); return /^[a-f0-9]{64}$/.test(t || '') ? t : ''; } catch { return ''; }
  }
  if (location.hash) { invite = fromLink(location.href); pendingEvent = deepLink(); history.replaceState(null, '', location.pathname); }
  async function call(route, method='GET', body, authenticated=false, extraHeaders={}) {
    const headers = { ...extraHeaders }; if (body) headers['Content-Type'] = 'application/json';
    if (authenticated) { const secret = localStorage.getItem('cos-device'); if (!secret) throw Error('未接続'); headers.Authorization = 'Bearer ' + secret; }
    const res = await fetch(API + route, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const value = await res.json(); if (!res.ok) { const e = Error(value.error || '接続できません'); e.status = res.status; throw e; } return value;
  }
  function showState() { status.textContent = !navigator.onLine ? 'オフライン' : !installed() ? 'ホーム画面から開いてください' : !('PushManager' in window) ? 'この端末では通知を利用できません' : '通知許可: ' + Notification.permission + (localStorage.getItem('cos-paired') ? ' / 接続済み' : ' / 未接続'); }
  async function reportRow(row) {
    const match = /^星空Village 運営日報 (\d{4}-\d{2}-\d{2})$/.exec(row.title || '');
    if (!match || !['completed','blocked'].includes(row.state) || !opaque(row.event_key)) return null;
    const date = match[1];
    if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return null;
    const bytes = new TextEncoder().encode('cos-village-report-v1\0beda9ca4-b7e1-4225-8de8-7d1b2d52578c\0' + date + '\0' + row.state);
    const key = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    return key === row.event_key ? { ...row, date } : null;
  }
  // A deliberately small presentation grammar. All source content goes through
  // textContent; no HTML, links, images or general Markdown execution exists.
  function renderReport(text) {
    reportText.replaceChildren();
    let parent=reportText, list=null;
    const literal=value=>value.replace(/\\([\\\x60*_{}[\]()!#|])/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
    for(const line of text.split(/\r?\n/)) {
      if(!line.trim()){list=null;continue;}
      const heading=/^(#{1,3})\s+(.+)$/.exec(line);
      if(heading) {
        list=null;parent=reportText;
        if(/^技術メモ(?:（|$)/.test(heading[2])) {
          const details=document.createElement('details'),summary=document.createElement('summary');
          summary.textContent='技術メモを表示';details.append(summary);reportText.append(details);parent=details;continue;
        }
        if(/^(?:30秒で分かる)?今日のまとめ$/.test(heading[2])) {
          const section=document.createElement('section');section.className='daily-summary';reportText.append(section);parent=section;
        }
        const h=document.createElement('h'+heading[1].length);h.textContent=literal(heading[2]);parent.append(h);continue;
      }
      const bullet=/^-\s+(.+)$/.exec(line);
      if(bullet) {
        if(!list){list=document.createElement('ul');parent.append(list);}
        const li=document.createElement('li');li.textContent=literal(bullet[1]);list.append(li);continue;
      }
      list=null;
      const p=document.createElement('p'),bold=/^\*\*(.+)\*\*$/.exec(line);
      if(bold){const strong=document.createElement('strong');strong.textContent=literal(bold[1]);p.append(strong);}
      else p.textContent=literal(line);
      parent.append(p);
    }
  }
  function closeReport() {
    document.body.classList.remove('report-open');
    viewEpoch++; currentReport = null; pendingEvent = ''; reportText.textContent = ''; reportStatus.textContent = ''; reportRetry.hidden = true;
    reportView.hidden = true; document.getElementById('inbox-view').hidden = false;
    document.getElementById('refresh').focus();
    history.replaceState(null, '', location.pathname);
  }
  async function openReport(row) {
    const epoch = ++viewEpoch; currentReport = row; pendingEvent = '';
    document.body.classList.add('report-open');
    reportView.hidden = false; document.getElementById('inbox-view').hidden = true;
    const heading = document.getElementById('report-heading'); heading.textContent = row.title; heading.hidden = false;
    reportView.scrollIntoView?.({ block: 'start' }); heading.focus({ preventScroll: true });
    reportText.textContent = ''; reportStatus.textContent = '本文を取得中…'; reportRetry.hidden = true;
    history.replaceState(null, '', location.pathname + '#report-event=' + row.event_key);
    try {
      const value = await call('report/' + row.date, 'GET', undefined, true, { 'X-CoS-Report-Event': row.event_key });
      if (epoch !== viewEpoch) return;
      if (value.date !== row.date || value.state !== row.state || value.event_key !== row.event_key || typeof value.text !== 'string' || new TextEncoder().encode(value.text).length > 8192 || !opaque(value.sha256)) throw Error('本文の確認に失敗しました');
      const actual = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.text))));
      if (epoch !== viewEpoch) return;
      if (actual !== value.sha256) throw Error('本文の確認に失敗しました');
      renderReport(value.text);
      heading.hidden = !!reportText.querySelector('h1');
      reportStatus.textContent = '';
    } catch(e) {
      if (epoch !== viewEpoch) return;
      reportStatus.textContent = e.status === 404 ? '本文を同期中です。「本文を再取得」で確認できます。' : e.status === 401 ? 'この端末の接続が無効です。Macで端末の接続状態を確認してください。' : '本文を取得できません。接続を確認して再取得してください。';
      reportRetry.hidden = e.status === 401;
    }
  }
  async function inbox() {
    const epoch = ++inboxEpoch;
    const rows = (await call('inbox', 'GET', undefined, true)).events;
    const entries = await Promise.all(rows.map(async row => ({ row, report: await reportRow(row) })));
    if (epoch !== inboxEpoch) return;
    rowsByKey = new Map();
    const list = document.getElementById('inbox'); list.replaceChildren();
    for (const {row,report} of entries) {
      const li = document.createElement('li');
      const label = row.title + ' — ' + row.state + ' (' + new Date(row.created_at).toLocaleString('ja-JP') + ')';
      if (report) {
        rowsByKey.set(report.event_key, report);
        const button = document.createElement('button'); button.className = 'report-row'; button.type = 'button'; button.textContent = label;
        button.setAttribute('aria-label', row.title + 'の本文を読む（' + row.state + '）');
        button.addEventListener('click', () => action(() => openReport(report))); li.append(button);
      } else li.textContent = label;
      list.append(li);
    }
    if (!rows.length) { const li = document.createElement('li'); li.textContent = 'まだ通知はありません'; list.append(li); }
    if (pendingEvent) {
      const row = rowsByKey.get(pendingEvent);
      if (row) await openReport(row);
      else if (rows.some(row => row.event_key === pendingEvent)) pendingEvent = '';
      else status.textContent = '対象の日報通知は受信箱にありません。「更新」で再確認できます。';
    }
  }
  async function connect() {
    if (!installed()) throw Error('先にホーム画面に追加し、追加したアプリから開いてください');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw Error('Web Push非対応です');
    invite = fromLink(pairInput.value) || invite;
    if (!invite && !localStorage.getItem('cos-device')) throw Error('Macで発行したペアURLが必要です');
    // Permission is requested directly in the user gesture, before asynchronous network work.
    const permission = await Notification.requestPermission(); if (permission !== 'granted') throw Error('通知が許可されていません');
    const registration = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }); await navigator.serviceWorker.ready;
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
  document.getElementById('report-close').addEventListener('click', closeReport);
  reportRetry.addEventListener('click', () => { if (currentReport) action(() => openReport(currentReport)); });
  async function openPending(key) { if (!opaque(key)) return; pendingEvent = key; await inbox(); }
  addEventListener('hashchange', () => { const key = deepLink(); if (key) action(() => openPending(key)); else closeReport(); });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.source !== navigator.serviceWorker.controller || event.data?.type !== 'cos-report-event') return;
    action(() => openPending(event.data.event_key));
  });
  document.getElementById('connect').addEventListener('click', () => action(connect));
  document.getElementById('refresh').addEventListener('click', () => action(inbox));
  document.getElementById('revoke').addEventListener('click', () => action(async () => { await call('revoke-self', 'POST', {}, true); const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); localStorage.removeItem('cos-device'); localStorage.removeItem('cos-paired'); inboxEpoch++; closeReport(); rowsByKey.clear(); document.getElementById('inbox').replaceChildren(); showState(); }));
  addEventListener('online', showState); addEventListener('offline', showState); showState();
  if (installed() && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch(() => { status.textContent='Service Workerを登録できません'; });
  if (localStorage.getItem('cos-paired')) action(inbox);
})();