// אוסף: לולאה שרצה כל שנייה ובודקת איזה מקור הגיע זמנו להיבדק.
// לכל מקור יש תדירות משלו + השהיה מוגברת (backoff) אחרי כשלונות.
const { parseFeed } = require('./rss');
const { classify, isRelevant } = require('./classify');

const { fetchBrave } = require('./brave');

const UA = 'Mozilla/5.0 (compatible; BambuRadar/1.0; +personal-news-aggregator)';

async function fetchFeed(source) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

class Collector {
  constructor(sources, store) {
    this.store = store;
    this.state = sources.map((s, i) => ({
      source: s,
      nextAt: Date.now() + i * 1500, // פיזור התחלתי
      running: false,
      fails: 0,
      lastRun: 0,
      lastOk: 0,
      error: '',
      lastCount: 0,
      total: 0,
    }));
    this.lastCheckAt = 0;
    this.lastNewAt = 0;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  tick() {
    const now = Date.now();
    for (const st of this.state) {
      if (!st.running && now >= st.nextAt) this.run(st);
    }
  }

  refreshAll() {
    for (const st of this.state) if (!st.running) this.run(st);
  }

  async run(st) {
    st.running = true;
    const { source } = st;
    try {
      const parsed = source.api === 'brave' ? await fetchBrave(source) : await fetchFeed(source);
      const now = Date.now();
      const candidates = [];
      for (const p of parsed) {
        if (!isRelevant(source, p.title, p.summary)) continue;
        let date = Date.parse(p.dateRaw);
        if (Number.isNaN(date)) date = now;
        if (date > now + 3600e3) date = now;
        let title = p.title;
        let publisher = p.publisher;
        // בגוגל ניוז הכותרת מסתיימת ב"- שם האתר"
        if (source.id.startsWith('gnews') && !publisher) {
          const m = title.match(/^(.*) - ([^-]{2,40})$/);
          if (m) { title = m[1]; publisher = m[2]; }
        }
        const meta = classify(source, { title, summary: p.summary });
        candidates.push({
          title,
          link: p.link,
          date,
          summary: p.summary.slice(0, 600),
          source: publisher ? `${publisher} · ${source.name}` : source.name,
          sourceId: source.id,
          ...meta,
        });
      }
      const added = this.store.addMany(candidates);
      st.lastOk = now;
      st.lastCount = added.length;
      st.total += added.length;
      st.error = '';
      st.fails = 0;
      if (added.length) this.lastNewAt = now;
      st.nextAt = now + source.interval * 1000;
    } catch (e) {
      st.fails += 1;
      st.error = e.name === 'TimeoutError' ? 'timeout' : e.message;
      const backoff = Math.min(source.interval * 2 ** Math.min(st.fails, 4), 600);
      st.nextAt = Date.now() + backoff * 1000;
    } finally {
      st.lastRun = Date.now();
      this.lastCheckAt = st.lastRun;
      st.running = false;
    }
  }

  status() {
    return {
      now: Date.now(),
      lastCheckAt: this.lastCheckAt,
      lastNewAt: this.lastNewAt,
      totalItems: this.store.items.length,
      counts: this.store.counts(),
      sources: this.state.map((st) => ({
        id: st.source.id,
        name: st.source.name,
        type: st.source.type,
        intervalSec: st.source.interval,
        lastRun: st.lastRun,
        lastOk: st.lastOk,
        error: st.error,
        fails: st.fails,
        found: st.total,
      })),
    };
  }
}

module.exports = { Collector };
