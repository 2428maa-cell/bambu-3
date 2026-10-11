(() => {
  const KIND_HE = { rumor: 'שמועה', official: 'רשמי', news: 'חדשות', community: 'קהילה', video: 'וידאו' };
  const $ = (id) => document.getElementById(id);

  const state = { kind: 'all', q: '', topic: '', items: [], status: null, lastStatusAt: 0, connected: false, history: [], orig: false };
  try { state.orig = localStorage.getItem('showOriginal') === '1'; } catch { /* אין אחסון, בסדר */ }
  const fresh = new Set();

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'לפני ' + s + ' שנ׳';
    const m = Math.floor(s / 60);
    if (m < 60) return 'לפני ' + m + ' דק׳';
    const h = Math.floor(m / 60);
    if (h < 24) return 'לפני ' + h + ' שע׳';
    const d = Math.floor(h / 24);
    if (d < 30) return 'לפני ' + d + ' ימים';
    return new Date(ms).toLocaleDateString('he-IL');
  }

  // ---------- פיד ----------
  function cardHtml(it) {
    const tags = (it.topics || []).slice(0, 4).map((t) => `<span class="tag" data-topic="${esc(t)}">${esc(t)}</span>`).join('');
    const he = !state.orig && it.titleHe;
    const title = he ? it.titleHe : it.title;
    const summary = he ? it.summaryHe : it.summary;
    return `
      <a class="card ${it.kind} ${fresh.has(it.id) ? 'fresh' : ''}" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer" data-id="${it.id}">
        <div class="meta">
          <span class="badge ${it.kind}">${KIND_HE[it.kind] || it.kind}</span>
          <span>${esc(it.source)}</span>
          <span>·</span>
          <span class="time" data-t="${it.date}">${ago(it.date)}</span>
          ${he ? '<span class="badge tr" title="תורגם אוטומטית מאנגלית">מתורגם</span>' : ''}
        </div>
        <h3 dir="auto">${esc(title)}</h3>
        ${summary ? `<p dir="auto">${esc(summary)}</p>` : ''}
        ${tags ? `<div class="tags">${tags}</div>` : ''}
      </a>`;
  }

  function render() {
    $('list').innerHTML = state.items.map(cardHtml).join('');
    $('empty').hidden = state.items.length > 0;
    $('more').hidden = state.items.length < 60;
  }

  function matches(it) {
    if (state.kind !== 'all' && it.kind !== state.kind) return false;
    if (state.topic && !(it.topics || []).includes(state.topic)) return false;
    const hay = `${it.title} ${it.summary} ${it.titleHe || ''} ${it.summaryHe || ''}`.toLowerCase();
    if (state.q && !hay.includes(state.q.toLowerCase())) return false;
    return true;
  }

  async function load(append = false) {
    const p = new URLSearchParams({ kind: state.kind, limit: '60' });
    if (state.q) p.set('q', state.q);
    if (state.topic) p.set('topic', state.topic);
    if (append && state.items.length) p.set('before', String(state.items[state.items.length - 1].date));
    try {
      const r = await fetch('/api/items?' + p);
      const data = await r.json();
      state.items = append ? state.items.concat(data.items) : data.items;
      updateCounts(data.counts);
      render();
      $('more').hidden = data.items.length < 60;
    } catch {
      /* ישתפר בניסיון הבא */
    }
  }

  function updateCounts(c) {
    if (!c) return;
    for (const k of ['all', 'rumor', 'official', 'news', 'community']) {
      const el = $('c-' + k);
      if (el) el.textContent = c[k] || 0;
    }
  }

  // ---------- זמן אמת (SSE) ----------
  function connect() {
    const es = new EventSource('/api/stream');
    es.onopen = () => { state.connected = true; };
    es.onerror = () => { state.connected = false; renderLive(); };

    es.addEventListener('status', (e) => {
      state.status = JSON.parse(e.data);
      state.lastStatusAt = Date.now();
      state.connected = true;
      updateCounts(state.status.counts);
      renderSources();
      renderLive();
    });

    es.addEventListener('translated', (e) => onTranslated(JSON.parse(e.data)));

    es.addEventListener('items', (e) => {
      const added = JSON.parse(e.data);
      const visible = added.filter(matches);
      for (const it of visible) fresh.add(it.id);
      if (visible.length) {
        state.items = visible.concat(state.items).sort((a, b) => b.date - a.date);
        render();
        setTimeout(() => visible.forEach((it) => fresh.delete(it.id)), 4000);
      }
      const rumors = added.filter((i) => i.kind === 'rumor').length;
      if (document.hidden) {
        newWhileHidden += added.length;
        document.title = `(${newWhileHidden}) Bambu Radar${rumors ? ' 🔥' : ''}`;
      }
    });
  }

  // תרגומים שמגיעים ברקע מתעדכנים בכרטיסים בלי רענון
  function onTranslated(list) {
    const byId = new Map(list.map((t) => [t.id, t]));
    let changed = false;
    for (const it of state.items) {
      const t = byId.get(it.id);
      if (t) { it.titleHe = t.titleHe; it.summaryHe = t.summaryHe; changed = true; }
    }
    if (changed) render();
  }

  let newWhileHidden = 0;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { newWhileHidden = 0; document.title = 'Bambu Radar · מכ"ם שמועות'; }
  });

  function renderLive() {
    const live = $('live');
    const st = state.status;
    if (!state.connected || !st) {
      live.className = 'live off';
      $('liveText').textContent = state.connected ? 'מתחבר…' : 'מנותק, מנסה להתחבר מחדש…';
      return;
    }
    live.className = 'live on';
    const sec = st.lastCheckAt ? Math.max(0, Math.round((Date.now() - st.lastCheckAt) / 1000)) : null;
    $('liveText').textContent = sec === null ? 'חי · מתחיל לאסוף…' : `חי · בדיקה אחרונה לפני ${sec} שנ׳`;
  }

  function renderSources() {
    const st = state.status;
    if (!st) return;
    const ok = st.sources.filter((s) => s.lastOk && !s.error).length;
    const bad = st.sources.filter((s) => s.error);
    let html = `${ok}/${st.sources.length} מקורות פעילים`;
    if (bad.length) html += ` · <span class="bad" title="${esc(bad.map((b) => b.name + ': ' + b.error).join('\n'))}">${bad.length} עם תקלה</span>`;
    $('sourcesLine').innerHTML = html;
  }

  // טיקר של כל שנייה: מעדכן "לפני X" בכרטיסים ובחיווי החי
  setInterval(() => {
    renderLive();
    document.querySelectorAll('.time').forEach((el) => { el.textContent = ago(Number(el.dataset.t)); });
  }, 1000);

  // ---------- פילטרים וחיפוש ----------
  $('kindChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
    state.kind = btn.dataset.kind;
    load();
  });

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250);
  });

  $('list').addEventListener('click', (e) => {
    const tag = e.target.closest('.tag');
    if (!tag) return;
    e.preventDefault();
    state.topic = state.topic === tag.dataset.topic ? '' : tag.dataset.topic;
    $('search').value = state.topic ? '' : $('search').value;
    state.q = $('search').value.trim();
    load();
  });

  $('more').addEventListener('click', () => load(true));

  $('origToggle').checked = state.orig;
  $('origToggle').addEventListener('change', (e) => {
    state.orig = e.target.checked;
    try { localStorage.setItem('showOriginal', state.orig ? '1' : '0'); } catch { /* לא קריטי */ }
    render();
  });

  // ---------- צ'אט ----------
  const messages = $('messages');

  function addMsg(role, html, cls = '') {
    const div = document.createElement('div');
    div.className = `msg ${role} ${cls}`;
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function botHtml(text, sources) {
    const byN = new Map(sources.map((s) => [s.n, s]));
    const used = new Set();
    let html = esc(text).replace(/\[(\d{1,2})\]/g, (m, n) => {
      const s = byN.get(Number(n));
      if (!s) return m;
      used.add(s.n);
      return `<sup><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">[${n}]</a></sup>`;
    });
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const refs = sources.filter((s) => used.has(s.n));
    if (refs.length) {
      html += '<div class="refs">מקורות:' + refs.map((s) =>
        `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" dir="auto">[${s.n}] ${esc(s.title)} <span>(${KIND_HE[s.kind] || s.kind})</span></a>`).join('') + '</div>';
    }
    return html;
  }

  async function ask(question) {
    const s = $('suggest');
    if (s) s.remove();
    addMsg('user', esc(question));
    state.history.push({ role: 'user', content: question });
    const typing = addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span>');
    $('sendBtn').disabled = true;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.history.slice(-10) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'שגיאה');
      typing.innerHTML = botHtml(data.answer, data.sources || []);
      state.history.push({ role: 'assistant', content: data.answer });
    } catch (e) {
      typing.className = 'msg bot err';
      typing.textContent = e.message || 'משהו השתבש, נסה שוב.';
      state.history.pop();
    } finally {
      $('sendBtn').disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('chatInput').value.trim();
    if (!q || $('sendBtn').disabled) return;
    $('chatInput').value = '';
    ask(q);
  });

  $('suggest').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') ask(e.target.textContent);
  });

  // ---------- מובייל ----------
  $('mobileTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.body.dataset.view = b.dataset.view;
    document.querySelectorAll('#mobileTabs button').forEach((x) => x.classList.toggle('active', x === b));
  });
  document.body.dataset.view = 'feed';

  load();
  connect();
})();
