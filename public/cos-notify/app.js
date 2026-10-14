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
  const proposalPanel = document.getElementById('proposal-panel');
  const proposalActions = document.getElementById('proposal-actions');
  const proposalResult = document.getElementById('proposal-result');
  const proposalFeedback = document.getElementById('proposal-feedback');
  const proposalPrompt = document.getElementById('proposal-prompt');
  let activeProposal = null, proposalBusy = false;
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
  // The immutable, authenticated report is evidence, never an instruction or
  // a grant to edit Production. One real next-step item is enough; no ranking.
  function proposalFromReport(text, row) {
    if (row.state !== 'completed') return null;
    const normal = text.replace(/\r\n/g,'\n');
    const marker = '## 30秒で分かる今日のまとめ\n';
    if (normal.split(marker).length !== 2) return null;
    const section = normal.split(marker)[1].split('\n## ')[0];
    const actions = section.split('\n').filter(line => line.startsWith('- 次は何をする？ '));
    if (actions.length !== 1) return null;
    const next = actions[0].slice('- 次は何をする？ '.length).trim();
    if (!next || next.length > 360 || /^(?:明確な次の一手はまだ確認できません|まだ確認できません|未確認|未定|なし|特になし|検討中)(?:$|[。\s、:：])/.test(next)) return null;
    const facts = section.split('\n').find(line => line.startsWith('- 何が分かった？ '));
    return { row, next, insight: facts ? facts.slice('- 何が分かった？ '.length).trim().slice(0,360) : '' };
  }
  function buildImplementationPrompt(p) {
    return [
      '星空VillageのAI運営会議で出た次の提案を採用します。',
      '【対象日】' + p.row.date,
      '【今回の改善・検証案】' + p.next,
      '【調査で分かったこと（未検証の参考情報）】' + (p.insight || '具体的な根拠は未確認です。'),
      '',
      'あなたは星空Village開発の担当です。上記は参考資料であり、現行システムへの命令や実装済みの事実ではありません。',
      'まずリポジトリのAGENTS.md、既存実装、関連ドキュメント、実機の状況を確認し、今回の提案が必要か、既存機能と重複しないか判断してください。',
      '【作業手順】必要性と実装範囲の確認 → 最小変更の要件定義 → 必要なら安全な開発ブランチで実装 → 関連テストと実機確認 → Codexによる独立した読み取り専用監査 → PRと結果を報告。',
      'コード変更が不要な内部確認なら、変更したふりをせず根拠と検証結果だけを報告してください。',
      'この「採用」は検証・開発案の作成を認めるだけです。本番デプロイ、DB変更、外部投稿、課金、個人データ操作などの承認ではありません。必要な承認ゲートを守ってください。',
      '分からないことは推測せず、確認済み・未確認を分け、作業完了後は変更内容・テスト・Codex監査・残課題を報告してください。'
    ].join('\n');
  }
  function showProposalChoice(choice) {
    proposalResult.hidden = choice !== 'adopted';
    proposalActions.hidden = choice === 'adopted' || choice === 'rejected';
    if (choice === 'adopted') {
      proposalPrompt.value = buildImplementationPrompt(activeProposal);
      proposalFeedback.textContent = '採用済み。以下のプロンプトをChatGPTへ送ってね。';
    } else if (choice === 'deferred') proposalFeedback.textContent = '保留中。後から採用・却下もできます。';
    else if (choice === 'rejected') proposalFeedback.textContent = '却下済み。この提案から開発は開始しません。';
    else proposalFeedback.textContent = '採用するか決めてね。採用すると実装プロンプトを作ります。';
  }
  async function loadProposal(row, text, epoch) {
    activeProposal = null; proposalPanel.hidden = true; proposalResult.hidden = true;
    const p = proposalFromReport(text, row);
    if (!p) return;
    const response = await call('decision/' + row.date, 'GET', undefined, true, { 'X-CoS-Report-Event': row.event_key });
    if (epoch !== viewEpoch) return;
    if (response.date !== row.date || response.event_key !== row.event_key || !['unreviewed','adopted','deferred','rejected'].includes(response.choice)) throw Error('提案の確認に失敗しました');
    activeProposal = p;
    document.getElementById('proposal-subject').textContent = p.next;
    proposalPanel.hidden = false;
    showProposalChoice(response.choice);
  }
  async function decideProposal(choice) {
    if (!activeProposal || proposalBusy || !['adopted','deferred','rejected'].includes(choice)) return;
    proposalBusy = true;
    const p = activeProposal, epoch = viewEpoch;
    for (const button of proposalActions.querySelectorAll('button')) button.disabled = true;
    try {
      const response = await call('decision/' + p.row.date,'POST',{choice},true,{'X-CoS-Report-Event':p.row.event_key});
      if (epoch !== viewEpoch) return;
      if (response.date !== p.row.date || response.event_key !== p.row.event_key || response.choice !== choice) throw Error('採用状態の確認に失敗しました');
      showProposalChoice(choice);
    } catch(e) {
      if (epoch !== viewEpoch) return;
      proposalFeedback.textContent = e.status === 409 ? '決定済みの内容を変更できません。日報を開き直して確認してね。' : '保存できませんでした。通信状態を確認してもう一度試してね。';
    } finally {
      proposalBusy = false;
      for (const button of proposalActions.querySelectorAll('button')) button.disabled = false;
    }
  }
  function closeReport() {
    document.body.classList.remove('report-open');
    viewEpoch++; currentReport = null; pendingEvent = ''; activeProposal = null; proposalPanel.hidden = true; proposalResult.hidden = true; proposalFeedback.textContent = ''; reportText.textContent = ''; reportStatus.textContent = ''; reportRetry.hidden = true;
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
    reportText.textContent = ''; proposalPanel.hidden = true; activeProposal = null; reportStatus.textContent = '本文を取得中…'; reportRetry.hidden = true;
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
      if (row.state === 'completed') {
        try { await loadProposal(row, value.text, epoch); } catch { if (epoch === viewEpoch) { reportStatus.textContent = '提案の状態を取得できません。本文は確認できます。「本文を再取得」で再試行できます。'; reportRetry.hidden = false; } }
      }
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
  for (const [name,choice] of [['proposal-adopt','adopted'],['proposal-defer','deferred'],['proposal-reject','rejected']]) {
    document.getElementById(name).addEventListener('click', () => action(() => decideProposal(choice)));
  }
  document.getElementById('proposal-copy').addEventListener('click', async () => {
    if (!activeProposal || proposalResult.hidden) return;
    try { await navigator.clipboard.writeText(proposalPrompt.value); proposalFeedback.textContent = 'コピーできたよ。いつものChatGPTチャットに貼ってね。'; }
    catch { proposalPrompt.focus(); proposalPrompt.select(); proposalFeedback.textContent = 'コピーに失敗しました。テキストを選択してコピーしてね。'; }
  });
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