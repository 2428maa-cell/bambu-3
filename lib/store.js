// אחסון פריטים בקובץ JSON + אירוע על פריטים חדשים (לדחיפה בזמן אמת)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const MAX_ITEMS = 3000;

function normalizeLink(link) {
  try {
    const u = new URL(link);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return (u.host + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '').slice(0, 70);
}

class Store extends EventEmitter {
  constructor(dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')) {
    super();
    this.file = path.join(dir, 'items.json');
    this.items = [];
    this.ids = new Set();
    this.titles = new Set();
    this.saveTimer = null;
  }

  load() {
    try {
      this.items = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.items = [];
    }
    this.ids = new Set(this.items.map((i) => i.id));
    this.titles = new Set(this.items.map((i) => titleKey(i.title)));
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.items));
        fs.renameSync(tmp, this.file);
      } catch (e) {
        console.error('שמירה נכשלה:', e.message);
      }
    }, 500);
  }

  makeId(link) {
    return crypto.createHash('sha1').update(normalizeLink(link)).digest('hex').slice(0, 16);
  }

  // מוסיף פריטים חדשים בלבד ומחזיר אותם
  addMany(candidates) {
    const added = [];
    for (const it of candidates) {
      const id = this.makeId(it.link);
      const tk = titleKey(it.title);
      if (this.ids.has(id) || (tk && this.titles.has(tk))) continue;
      this.ids.add(id);
      if (tk) this.titles.add(tk);
      const full = { ...it, id, addedAt: Date.now() };
      this.items.push(full);
      added.push(full);
    }
    if (added.length) {
      this.items.sort((a, b) => b.date - a.date);
      if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
      this.save();
      this.emit('items', added);
    }
    return added;
  }

  query({ kind, q, topic, limit = 60, before } = {}) {
    let list = this.items;
    if (kind && kind !== 'all') list = list.filter((i) => i.kind === kind);
    if (topic) list = list.filter((i) => i.topics.includes(topic));
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((i) =>
        `${i.title} ${i.summary} ${i.titleHe || ''} ${i.summaryHe || ''}`.toLowerCase().includes(needle),
      );
    }
    if (before) list = list.filter((i) => i.date < before);
    return list.slice(0, Math.min(Math.max(limit, 1), 200));
  }

  // פריטים שעוד לא תורגמו (הכי חדשים קודם). פריט שכבר בעברית לא צריך תרגום.
  untranslated(n) {
    const out = [];
    for (const i of this.items) {
      if (i.titleHe || (i.trAttempts || 0) >= 3 || /[֐-׿]/.test(i.title)) continue;
      out.push(i);
      if (out.length >= n) break;
    }
    return out;
  }

  applyTranslations(list) {
    const byId = new Map(this.items.map((i) => [i.id, i]));
    const applied = [];
    for (const t of list) {
      const it = byId.get(t.id);
      if (!it) continue;
      it.titleHe = t.title;
      it.summaryHe = t.summary || '';
      applied.push({ id: it.id, titleHe: it.titleHe, summaryHe: it.summaryHe });
    }
    if (applied.length) this.save();
    return applied;
  }

  counts() {
    const c = { all: this.items.length, rumor: 0, official: 0, news: 0, community: 0, video: 0 };
    for (const i of this.items) c[i.kind] = (c[i.kind] || 0) + 1;
    return c;
  }
}

module.exports = { Store, normalizeLink, titleKey };
