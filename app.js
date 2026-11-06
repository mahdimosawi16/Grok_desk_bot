/* Grok Bot Desk — Plan B (STEP 8). Polls /d/{DATA_PATH}/{state,chart,activity,account}.json */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const AGENTS = [
    { id: 'scanner', name: 'Scanner', color: '#64d2ff' },
    { id: 'auditor', name: 'Auditor', color: '#bf5af2' },
    { id: 'analyst', name: 'Analyst', color: '#ffd60a' },
    { id: 'executor', name: 'Executor', color: '#00d35a' },
    { id: 'risk', name: 'Risk', color: '#ff6b9a' },
  ];
  const LAYER_NAMES = [
    'Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders',
    'Liquidity', 'Pool age', 'Bundled wallets', 'Delegations',
  ];

  let state = null, chart = null, activity = null, account = null;
  let lastGood = null;
  let range = 'LIVE';
  let pollTimer = null;
  let retryIn = 15;
  let offline = false;
  let currentCoin = null;
  let currentAudit = null;

  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const m = /(?:^|&)d=([^&]+)/.exec(h);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function dataPath() {
    const d = parseHash();
    if (d) { try { localStorage.setItem('desk_d', d); } catch (_) {} return d; }
    try { return localStorage.getItem('desk_d'); } catch (_) { return null; }
  }
  function baseUrl() {
    const d = dataPath();
    if (!d) return null;
    if (window.__DESK_JSON_URL__) return window.__DESK_JSON_URL__.replace(/\/?$/, '/');
    return 'https://utlybsuqokbgjlzgtlmo.supabase.co/functions/v1/desk/d/' + d + '/';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    const v = Number(n || 0);
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    const v = Number(n || 0);
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function ago(ts) {
    if (!ts) return '';
    const t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!t) return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function shortMint(m) {
    if (!m) return '—';
    m = String(m);
    return m.length > 10 ? m.slice(0, 4) + '…' + m.slice(-4) : m;
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return String(ts); }
  }

  /* ---------- fetch ---------- */
  async function fetchJSON(rel) {
    const base = baseUrl();
    if (!base) throw new Error('no data path');
    const r = await fetch(base + rel, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function fetchAll() {
    if (!baseUrl()) {
      setError('Open this app from the link Telegram sent (it includes your data path).');
      showLoading(false);
      renderAll();
      return;
    }
    try {
      const [s, c, a, acc] = await Promise.all([
        fetchJSON('state.json'),
        fetchJSON('chart.json'),
        fetchJSON('activity.json'),
        fetchJSON('account.json'),
      ]);
      state = s; chart = c; activity = a; account = acc;
      lastGood = { state, chart, activity, account, at: Date.now() };
      offline = false;
      retryIn = 15;
      clearError();
      showLoading(false);
      renderAll();
    } catch (e) {
      offline = true;
      const last = lastGood && lastGood.at ? fmtTime(lastGood.at) : (state && state.lastUpdate ? fmtTime(state.lastUpdate) : '—');
      setError('Desk offline · retrying in ' + retryIn + 's · last update ' + last);
      // keep last good numbers
      showLoading(false);
      renderAll();
    }
  }

  function setError(msg) {
    const el = $('#err');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearError() { $('#err').classList.add('hidden'); }
  function showLoading(on) {
    $('#homeLoading').classList.toggle('hidden', !on);
    $('#homeBody').classList.toggle('hidden', on);
  }

  /* ---------- Agent cards ---------- */
  function agentByName(name) {
    const arr = (state && state.agents) || [];
    return arr.find((a) => a.name === name) || null;
  }

  function cardScanner(meta, a) {
    const card = (a && a.card) || {};
    const pools = card.pools != null ? card.pools : 0;
    const feed = card.feed || [];
    let body = '<div class="feed">';
    if (!feed.length) {
      body += '<div class="empty" style="padding:28px 0">Listening for graduations</div>';
    } else {
      feed.slice(0, 8).forEach((row) => {
        if (row.kind === 'kill') {
          body += '<div class="kill"><span>' + esc(row.text) + '</span>'
               + '<span class="why">' + esc(row.reason || '') + '</span></div>';
        } else {
          body += '<div class="pass">' + esc(row.text) + '</div>';
        }
      });
    }
    body += '</div>';
    return wrapCard(meta, a, card.status || (pools + ' pools'), body);
  }

  function cardAuditor(meta, a) {
    const card = (a && a.card) || {};
    const layers = card.layers || [];
    const by = {};
    layers.forEach((l) => { by[l.n] = l; });
    let body = '<div class="meta">' + (card.taken != null ? card.taken + ' taken apart' : '')
      + (card.rejected != null ? ' · ' + card.rejected + ' rejected' : '') + '</div>';
    body += '<div class="layers">';
    for (let i = 1; i <= 8; i++) {
      const L = by[i];
      let cls = 'grey', mark = '·', label = LAYER_NAMES[i - 1];
      if (L) {
        label = L.name || label;
        if (L.value === 'not checked') { cls = 'grey'; mark = '·'; }
        else if (L.pass) { cls = 'ok'; mark = '✓'; }
        else { cls = 'bad'; mark = '✗'; }
      }
      body += '<div class="layer ' + cls + '"><span>' + esc(label) + '</span>'
           + '<span style="float:right">' + mark + '</span></div>';
    }
    body += '</div>';
    return wrapCard(meta, a, card.status || 'taking apart...', body);
  }

  function cardAnalyst(meta, a) {
    const card = (a && a.card) || {};
    const score = card.score;
    const ring = score == null ? 0 : Math.max(0, Math.min(100, Number(score)));
    const col = ring >= 70 ? '#00d35a' : ring >= 40 ? '#ffd60a' : '#ff453a';
    const body = '<div class="score-wrap">'
      + '<svg width="140" height="140" viewBox="0 0 140 140">'
      + '<circle cx="70" cy="70" r="58" fill="none" stroke="#2c2c2e" stroke-width="10"/>'
      + '<circle cx="70" cy="70" r="58" fill="none" stroke="' + col + '" stroke-width="10" '
      + 'stroke-linecap="round" stroke-dasharray="' + (2 * Math.PI * 58).toFixed(2) + '" '
      + 'stroke-dashoffset="' + (2 * Math.PI * 58 * (1 - ring / 100)).toFixed(2) + '" '
      + 'transform="rotate(-90 70 70)"/>'
      + '<text x="70" y="76" text-anchor="middle" fill="#fff" font-size="32" font-weight="700" font-variant-numeric="tabular-nums">'
      + (score == null ? '—' : Math.round(score)) + '</text></svg></div>';
    return wrapCard(meta, a, card.status || 'Scoring', body);
  }

  function cardExecutor(meta, a) {
    const card = (a && a.card) || {};
    const bar = card.bar != null ? card.bar : 0;
    const size = card.sizeUsd != null ? money(card.sizeUsd) : '—';
    const stack = card.stackPct != null ? Number(card.stackPct).toFixed(0) + '%' : '—';
    let body = '<div class="meta">' + size + ' · ' + stack + ' of stack</div>';
    body += '<div class="exec-bar"><i style="width:' + Math.max(0, Math.min(100, bar)) + '%"></i></div>';
    body += '<div class="meta" style="margin-top:8px">' + esc(card.status || 'Idle') + '</div>';
    return wrapCard(meta, a, (card.trades != null ? card.trades + ' trades' : '0 trades'), body);
  }

  function cardRisk(meta, a) {
    const card = (a && a.card) || {};
    const stop = card.stopPct != null ? card.stopPct : null;
    const trail = card.trailPct != null ? card.trailPct : null;
    const body = '<div class="risk-pills">'
      + '<span class="pill red">stop -' + (stop != null ? Number(stop).toFixed(0) : '—') + '%</span>'
      + '<span class="pill green">trail ' + (trail != null ? Number(trail).toFixed(0) : '—') + '%</span>'
      + '</div>'
      + '<div class="meta" style="margin-top:12px">' + (card.open != null ? card.open + ' open' : '') + '</div>';
    return wrapCard(meta, a, card.status || 'Guarding', body);
  }

  function wrapCard(meta, a, headline, body) {
    const running = !!(a && a.heartbeat && !a.paused);
    return '<article class="acard" data-agent="' + meta.id + '" style="border-top-color:' + meta.color + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<h3>' + meta.name + '</h3>'
      + '<span class="status-dot' + (running ? '' : ' off') + '"></span></div>'
      + '<div class="headline">' + esc(String(headline)) + '</div>'
      + '<div class="body">' + body + '</div></article>';
  }

  function renderCard(meta) {
    const a = agentByName(meta.id);
    switch (meta.id) {
      case 'scanner': return cardScanner(meta, a);
      case 'auditor': return cardAuditor(meta, a);
      case 'analyst': return cardAnalyst(meta, a);
      case 'executor': return cardExecutor(meta, a);
      case 'risk': return cardRisk(meta, a);
    }
  }

  /* ---------- Home ---------- */
  function renderHome() {
    const s = state || {};
    const bal = s.balance != null ? s.balance : 200;
    $('#balance').textContent = money(bal);
    const mode = (s.mode || 'PAPER').toUpperCase();
    const pill = $('#paperPill');
    pill.textContent = mode;
    pill.className = 'pill ' + (mode === 'LIVE' ? 'green' : 'orange');
    pill.style.display = mode === 'LIVE' ? 'none' : '';
    const tp = s.todayPct != null ? s.todayPct : 0;
    const tpEl = $('#todayPct');
    tpEl.textContent = pct(tp) + ' today';
    tpEl.style.color = tp >= 0 ? 'var(--green)' : 'var(--red)';
    const mult = s.multiplier != null ? s.multiplier : 1;
    $('#mult').textContent = Number(mult).toFixed(2) + '×';

    const pts = filterPoints((chart && chart.points) || [], range);
    const marks = (chart && chart.marks) || [];
    const start = pts.length ? Number(pts[0].value) : bal;
    DeskChart.equity($('#homeChart'), pts, { marks, start });

    let running = 0;
    $('#agentCarousel').innerHTML = AGENTS.map((meta) => {
      const a = agentByName(meta.id);
      if (a && a.heartbeat && !a.paused) running++;
      return renderCard(meta);
    }).join('');
    $('#agentsRunning').textContent = running + ' running';
    $$('#agentCarousel .acard').forEach((el) => {
      el.addEventListener('click', () => openAgent(el.dataset.agent));
    });

    const rows = ((activity && activity.rows) || []).slice(0, 5);
    renderActivityList($('#homeActivity'), rows);
  }

  function filterPoints(points, r) {
    if (!points || !points.length) return [];
    if (r === 'ALL' || r === 'LIVE') return points;
    const ms = { '1H': 3600e3, '4H': 4 * 3600e3, '1D': 86400e3, '1W': 7 * 86400e3 }[r];
    if (!ms) return points;
    const cut = Date.now() - ms;
    return points.filter((p) => Date.parse(p.ts) >= cut);
  }

  function renderActivityList(el, rows) {
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="empty">Nothing yet tonight</div>';
      return;
    }
    el.innerHTML = rows.map((r, idx) => {
      return '<div class="act" data-i="' + idx + '"><div><div class="t">' + esc(r.title || r.kind || 'Event') + '</div>'
        + '<div class="s">' + esc(r.subtitle || '') + (r.ts ? ' · ' + ago(r.ts) : '') + '</div></div>'
        + '<div class="v">' + esc(r.value || '') + '</div></div>';
    }).join('');
  }

  /* ---------- Agents tab ---------- */
  function renderAgents() {
    const box = $('#view-agents');
    if (!state) {
      box.innerHTML = '<div class="empty">Waiting for desk…</div>';
      return;
    }
    box.innerHTML = '<h2 class="sec">Agents</h2>' + AGENTS.map((meta) => {
      const a = agentByName(meta.id) || {};
      const running = !!(a.heartbeat && !a.paused);
      const card = a.card || {};
      return '<div class="fullcard" data-agent="' + meta.id + '" style="border-left:3px solid ' + meta.color + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<strong>' + meta.name + '</strong>'
        + '<span class="pill ' + (running ? 'green' : 'orange') + '">' + (a.paused ? 'paused' : (running ? 'running' : 'idle')) + '</span>'
        + '</div>'
        + '<div class="meta" style="margin-top:6px">' + esc(card.status || '') + '</div>'
        + '<div class="meta">hb ' + esc(ago(a.heartbeat) || '—') + '</div>'
        + '</div>';
    }).join('');
    $$('#view-agents .fullcard').forEach((el) => {
      el.addEventListener('click', () => openAgent(el.dataset.agent));
    });
  }

  async function openAgent(id) {
    if (id === 'auditor') {
      showView('auditor');
      await renderAuditor();
      return;
    }
    showView('agents');
  }

  /* ---------- Auditor disc stack + beam ---------- */
  async function renderAuditor(mint) {
    const box = $('#view-auditor');
    let layers = [];
    let headline = 'No coin taken apart yet';
    let coinUrl = null;
    let reason = null;
    let passed = null;

    if (mint) {
      try {
        const data = await fetchJSON('audit/' + mint + '.json');
        currentAudit = data;
        layers = data.layers || [];
        coinUrl = data.coin_url;
        // determine status
        const checked = layers.filter((l) => l.value !== 'not checked');
        const bad = checked.find((l) => !l.pass);
        if (bad) { headline = 'Rejected · ' + (bad.value_text || bad.value || ''); passed = false; reason = bad.value_text || bad.value; }
        else if (checked.length === 8) { headline = 'Cleared · 8/8 parts'; passed = true; }
        else { headline = 'taking apart...'; }
      } catch (_) {
        headline = 'No coin taken apart yet';
      }
    } else {
      // latest from auditor card
      const a = agentByName('auditor');
      const card = (a && a.card) || {};
      layers = card.layers || [];
      headline = card.status || headline;
      if (!layers.length) {
        box.innerHTML = '<button class="link" id="audBack">‹ Agents</button>'
          + '<h2 class="sec">Auditor</h2>'
          + '<div class="empty">No coin taken apart yet</div>';
        $('#audBack').onclick = () => { showView('agents'); renderAgents(); };
        return;
      }
    }

    const by = {};
    layers.forEach((l) => { by[l.n || l.layer] = l; });
    let discs = '';
    for (let i = 1; i <= 8; i++) {
      const L = by[i] || {};
      const val = L.value_text || L.value || '';
      let cls = 'grey', mark = '·';
      if (val === 'not checked' || !val) { cls = 'grey'; mark = '·'; }
      else if (L.pass) { cls = 'ok'; mark = '✓'; }
      else { cls = 'bad'; mark = '✗'; }
      discs += '<div class="disc ' + cls + '" data-i="' + i + '">'
        + '<i class="beam"></i>'
        + '<span>' + esc(L.name || LAYER_NAMES[i - 1]) + (val ? ' · ' + esc(val) : '') + '</span>'
        + '<span class="mark">' + mark + '</span></div>';
    }
    const footer = passed === false
      ? '<div class="fullcard" style="color:var(--red)">Rejected · ' + esc(reason || '') + '<div class="meta">Grok Bot won\'t buy this</div></div>'
      : passed === true
        ? '<div class="fullcard" style="color:var(--green)">Cleared · 8/8 parts<div class="meta">Sent to Executor</div></div>'
        : '';
    box.innerHTML = '<button class="link" id="audBack">‹ Back</button>'
      + '<h2 class="sec">Auditor</h2>'
      + '<div class="meta">' + esc(headline) + '</div>'
      + '<div class="disc-stack">' + discs + '</div>'
      + footer
      + (coinUrl ? '<a class="btn" style="margin-top:12px" href="' + esc(coinUrl) + '" target="_blank" rel="noopener">Open on FOMO</a>' : '');
    $('#audBack').onclick = () => { showView('agents'); renderAgents(); };
    // beam animation top→bottom — only on layers the server actually checked
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $$('#view-auditor .disc').forEach((d, i) => {
      if (d.classList.contains('grey')) return; // not checked — no beam settle
      if (reduce) { d.classList.add('reading'); return; }
      setTimeout(() => d.classList.add('reading'), 350 * i);
    });
  }

  /* ---------- Activity ---------- */
  function renderActivity() {
    const box = $('#view-activity');
    const rows = (activity && activity.rows) || [];
    box.innerHTML = '<h2 class="sec">Activity</h2><div id="actFull" class="act-list"></div>';
    renderActivityList($('#actFull'), rows);
    $$('#actFull .act').forEach((el) => {
      el.addEventListener('click', () => {
        const row = rows[Number(el.dataset.i)];
        if (!row) return;
        if (row.kind === 'rejected' || row.agent === 'auditor') {
          showView('auditor');
          renderAuditor(row.mint);
        } else if (row.mint) {
          openCoin(row);
        }
      });
    });
  }

  /* ---------- Coin candles ---------- */
  async function openCoin(row) {
    showView('coin');
    const box = $('#view-coin');
    const mint = row.mint || '';
    box.innerHTML = '<div class="skel" style="height:40px;width:40%"></div>'
      + '<div class="skel" style="height:220px;margin-top:12px"></div>';
    let data = null;
    try { data = await fetchJSON('coin/' + mint + '.json'); } catch (_) {}
    currentCoin = data;
    const sym = (data && (data.symbol || data.name)) || row.title || shortMint(mint);
    const prices = (data && data.prices) || [];
    const bars = buildCandles(prices);
    const mode = ((state && state.mode) || 'PAPER').toUpperCase();
    const pos = data && data.position;
    const settings = (data && data.settings) || {};
    box.innerHTML = '<button class="link" id="coinBack">‹ Back</button>'
      + '<div style="display:flex;align-items:center;gap:8px"><h2 class="sec" style="margin:0">' + esc(sym) + '</h2>'
      + (mode === 'PAPER' ? '<span class="pill orange">PAPER</span>' : '') + '</div>'
      + '<div class="meta">' + esc(shortMint(mint)) + ' · Solana</div>'
      + '<div class="chart-wrap" style="height:240px;margin-top:12px"><canvas id="coinChart"></canvas></div>'
      + '<div class="fullcard" style="margin-top:12px">'
      + '<div class="row"><span class="label">Holders</span><span class="val">' + esc((data && data.holders) != null ? data.holders : 'n/a') + '</span></div>'
      + (pos ? '<div class="row"><span class="label">Your position</span><span class="val">' + money(pos.size_usd || pos.cost_usd || 0) + '</span></div>' : '')
      + (pos ? '<div class="row"><span class="label">Stop</span><span class="val">-' + esc(settings.stop_pct != null ? settings.stop_pct : '—') + '%</span></div>' : '')
      + (pos ? '<div class="row"><span class="label">Trail</span><span class="val">' + esc(settings.trail_pct != null ? settings.trail_pct : '—') + '%</span></div>' : '')
      + '</div>'
      + (data && data.coin_url ? '<a class="btn" style="margin-top:12px" href="' + esc(data.coin_url) + '" target="_blank" rel="noopener">Open on FOMO</a>' : '');
    $('#coinBack').onclick = () => { showView('activity'); renderActivity(); };
    requestAnimationFrame(() => DeskChart.candles($('#coinChart'), bars));
  }

  function buildCandles(prices) {
    // 1-minute OHLC from db.prices; volume = delta of volume_m5
    if (!prices || !prices.length) return [];
    const buckets = {};
    prices.forEach((p) => {
      const t = Date.parse(p.ts);
      if (!t) return;
      const key = Math.floor(t / 60000) * 60000;
      const px = Number(p.price);
      if (!buckets[key]) buckets[key] = { t: key, o: px, h: px, l: px, c: px, v: 0, lastVol: Number(p.volume_m5) || 0 };
      else {
        const b = buckets[key];
        if (px > b.h) b.h = px;
        if (px < b.l) b.l = px;
        b.c = px;
        const vol = Number(p.volume_m5) || 0;
        b.v = Math.max(0, vol - b.lastVol);
        b.lastVol = vol;
      }
    });
    return Object.keys(buckets).sort().map((k) => buckets[k]);
  }

  /* ---------- Account ---------- */
  function renderAccount() {
    const box = $('#view-account');
    const s = state || {};
    const acc = account || {};
    const settings = acc.settings || {};
    const mode = (s.mode || acc.mode || 'PAPER').toUpperCase();
    box.innerHTML = '<h2 class="sec">Account</h2>'
      + '<div class="fullcard">'
      + '<div class="row"><span class="label">Mode</span><span class="val"><span class="pill ' + (mode === 'LIVE' ? 'green' : 'orange') + '">' + esc(mode) + '</span></span></div>'
      + '<div class="row"><span class="label">Balance</span><span class="val">' + money(s.balance != null ? s.balance : acc.stack || 200) + '</span></div>'
      + '<div class="row"><span class="label">Multiplier</span><span class="val">' + Number(s.multiplier != null ? s.multiplier : 1).toFixed(2) + '×</span></div>'
      + '<div class="row"><span class="label">FOMO</span><span class="val"><a href="' + esc(acc.profile_url || '#') + '" target="_blank" rel="noopener" style="color:var(--blue)">@' + esc(acc.fomo_handle || 'mahdi06') + '</a></span></div>'
      + '</div>'
      + '<div class="settings-group"><h4>Risk (read-only · change via Telegram)</h4><div class="fullcard">'
      + rowKV('Stop loss', settings['risk.stop_pct'] != null ? '-' + settings['risk.stop_pct'] + '%' : '—')
      + rowKV('Trail', settings['risk.trail_pct'] != null ? settings['risk.trail_pct'] + '%' : '—')
      + rowKV('Trail start', settings['risk.trail_start_pct'] != null ? settings['risk.trail_start_pct'] + '%' : '—')
      + rowKV('Timeout', settings['risk.timeout_h'] != null ? settings['risk.timeout_h'] + 'h' : '—')
      + rowKV('Stack %', settings['executor.stack_pct'] != null ? settings['executor.stack_pct'] + '%' : '—')
      + rowKV('Min ticket', settings['executor.min_ticket_usd'] != null ? money(settings['executor.min_ticket_usd']) : '—')
      + '</div></div>'
      + '<div class="settings-group"><h4>Scanner / Auditor / Analyst</h4><div class="fullcard">'
      + rowKV('Min liquidity', settings['scanner.min_liquidity_usd'] != null ? money(settings['scanner.min_liquidity_usd']) : '—')
      + rowKV('Auditor', settings['auditor.enabled'] ? 'on' : 'off')
      + rowKV('Analyst mode', settings['analyst.mode'] || '—')
      + rowKV('Min score', settings['analyst.min_score'] != null ? settings['analyst.min_score'] : '—')
      + '</div></div>'
      + '<p class="meta" style="margin-top:16px">' + esc(acc.note || 'Settings are changed in Telegram. This screen is read-only.') + '</p>';
  }
  function rowKV(k, v) {
    return '<div class="row"><span class="label">' + esc(k) + '</span><span class="val">' + esc(String(v)) + '</span></div>';
  }

  /* ---------- Nav ---------- */
  function showView(name) {
    ['home','agents','activity','account','auditor','coin'].forEach((v) => {
      const el = $('#view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
    $$('.tabbar button').forEach((b) => {
      const on = b.dataset.tab === name
        || (name === 'auditor' && b.dataset.tab === 'agents')
        || (name === 'coin' && b.dataset.tab === 'activity');
      b.classList.toggle('on', on);
    });
  }
  function renderAll() {
    renderHome();
    // other tabs render on demand / keep fresh
    if (!$('#view-agents').classList.contains('hidden')) renderAgents();
    if (!$('#view-activity').classList.contains('hidden')) renderActivity();
    if (!$('#view-account').classList.contains('hidden')) renderAccount();
  }

  $$('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => {
      showView(b.dataset.tab);
      if (b.dataset.tab === 'home') renderHome();
      if (b.dataset.tab === 'agents') renderAgents();
      if (b.dataset.tab === 'activity') renderActivity();
      if (b.dataset.tab === 'account') renderAccount();
    });
  });
  $('#seeAll').addEventListener('click', () => { showView('activity'); renderActivity(); });
  $('#navAvatar').addEventListener('click', () => { showView('account'); renderAccount(); });
  $('#navSearch').addEventListener('click', () => {
    $('#searchBar').classList.toggle('hidden');
    if (!$('#searchBar').classList.contains('hidden')) $('#searchInput').focus();
  });
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = $('#searchInput').value.trim().toLowerCase();
    const rows = ((activity && activity.rows) || []).filter((r) => {
      const blob = ((r.title||'') + ' ' + (r.subtitle||'') + ' ' + (r.mint||'')).toLowerCase();
      return blob.includes(q);
    });
    showView('activity');
    const box = $('#view-activity');
    box.innerHTML = '<h2 class="sec">Search</h2><div id="actFull" class="act-list"></div>';
    renderActivityList($('#actFull'), rows);
    if (!rows.length) $('#actFull').innerHTML = '<div class="empty">No matches</div>';
  });
  $('#rangeSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    range = b.dataset.range;
    $$('#rangeSwitch button').forEach((x) => x.classList.toggle('on', x === b));
    renderHome();
  });

  window.addEventListener('hashchange', () => { showLoading(true); fetchAll(); });
  window.addEventListener('resize', () => { if (state) renderHome(); });

  // boot
  showLoading(true);
  DeskChart.emptyEquity($('#homeChart'));
  fetchAll();
  pollTimer = setInterval(() => {
    if (offline) {
      retryIn = Math.max(1, retryIn - 15);
      if (retryIn <= 0) retryIn = 15;
    }
    fetchAll();
  }, 15000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // expose for screenshot harness
  window.__desk = {
    showView, renderHome, renderAgents, renderActivity, renderAccount, renderAuditor, openCoin,
    setOffline(msg) { offline = true; setError(msg || 'Desk offline · retrying in 15s · last update —'); },
    setDemo(s, c, a, acc) { state = s; chart = c; activity = a; account = acc; showLoading(false); clearError(); renderAll(); },
  };
})();
