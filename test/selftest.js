// בדיקה עצמית בלי רשת: פרסר, סיווג, כפילויות ושליפה לצ'אט
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { parseFeed } = require('../lib/rss');
const { classify, isRelevant } = require('../lib/classify');
const { Store } = require('../lib/store');
const { retrieve } = require('../lib/chat');

const rss = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Bambu Lab H2S leaked in FCC filing - TechSite]]></title>
<link>https://example.com/a?utm_source=x</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate>
<description>&lt;p&gt;An unannounced printer &amp;amp; more&lt;/p&gt;</description><source url="https://example.com">TechSite</source></item>
<item><title>Bambu Lab releases firmware update</title><link>https://example.com/b</link>
<pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><description>New firmware for P1S</description></item>
<item><title>Unrelated cooking news</title><link>https://example.com/c</link><description>pasta</description></item>
</channel></rss>`;

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Rumor: new AMS coming?</title>
<link href="https://www.reddit.com/r/BambuLab/comments/1/x/" /><updated>2026-10-09T08:00:00+00:00</updated>
<content type="html">&lt;div&gt;Anyone heard about a new AMS?&lt;/div&gt;</content></entry></feed>`;

const a = parseFeed(rss);
assert.strictEqual(a.length, 3);
assert.strictEqual(a[0].title, 'Bambu Lab H2S leaked in FCC filing - TechSite');
assert.strictEqual(a[0].summary, 'An unannounced printer & more');
assert.strictEqual(a[0].publisher, 'TechSite');

const b = parseFeed(atom);
assert.strictEqual(b.length, 1);
assert.strictEqual(b[0].link, 'https://www.reddit.com/r/BambuLab/comments/1/x/');
assert.strictEqual(b[0].summary, 'Anyone heard about a new AMS?');

const news = { id: 'gnews', type: 'news', url: 'https://x' };
assert.strictEqual(isRelevant(news, 'Unrelated cooking news', 'pasta'), false);
assert.strictEqual(isRelevant(news, a[0].title, a[0].summary), true);
assert.strictEqual(classify(news, a[0]).kind, 'rumor');
assert.strictEqual(classify(news, a[1]).kind, 'news');
assert.ok(classify(news, a[1]).topics.includes('P1S'));
assert.strictEqual(classify({ type: 'official', official: true, url: 'x' }, a[1]).kind, 'official');
assert.strictEqual(classify({ type: 'community', url: 'https://www.reddit.com/r/BambuLab/' }, b[0]).kind, 'rumor');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
const store = new Store(dir);
store.load();
let emitted = 0;
store.on('items', (x) => { emitted += x.length; });
const mk = (p, src) => ({ ...p, date: Date.parse(p.dateRaw) || Date.now(), source: src, sourceId: src, ...classify(news, p) });
assert.strictEqual(store.addMany([mk(a[0], 's1'), mk(a[1], 's1')]).length, 2);
// כפילות לפי קישור (עם utm) ולפי כותרת מאתר אחר
assert.strictEqual(store.addMany([mk(a[0], 's2'), mk({ ...a[1], link: 'https://other.com/zzz' }, 's2')]).length, 0);
assert.strictEqual(emitted, 2);

const found = retrieve(store.items, { keywords: ['H2S'], rumors: true, days: null });
assert.strictEqual(found[0].title.includes('H2S'), true);
assert.strictEqual(retrieve(store.items, { keywords: [], rumors: false, days: null }).length, 2);

console.log('כל הבדיקות עברו ✔');
// ---- תרגום ----
(async () => {
  const { Translator, parseTranslations } = require('../lib/translate');
  const ok = parseTranslations('הנה:\n[{"id":"x1","title":"כותרת","summary":"תקציר"},{"id":"zzz","title":"לא שייך"},{"id":"x1","title":""}]', ['x1']);
  assert.strictEqual(ok.length, 1);
  assert.strictEqual(ok[0].title, 'כותרת');
  assert.deepStrictEqual(parseTranslations('לא JSON', ['x1']), []);

  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-tr-'));
  const ts = new Store(tdir);
  ts.load();
  ts.addMany([mk(a[0], 's1'), mk(a[1], 's1'), mk({ ...b[0], title: 'כבר בעברית', link: 'https://he.example/1' }, 's1')]);
  assert.strictEqual(ts.untranslated(10).length, 2, 'פריט בעברית לא נכנס לתור');

  process.env.ANTHROPIC_API_KEY = 'test-key';
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const input = JSON.parse(JSON.parse(opts.body).messages[0].content);
    const reply = input.map((i) => ({ id: i.id, title: 'תרגום: ' + i.title.slice(0, 10), summary: 'תקציר מתורגם' }));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(reply) }] }) };
  };
  const tr = new Translator(ts);
  const got = [];
  tr.on('translated', (l) => got.push(...l));
  await tr.kick();
  global.fetch = realFetch;
  assert.strictEqual(got.length, 2);
  assert.strictEqual(ts.untranslated(10).length, 0);
  assert.ok(ts.items.find((i) => i.titleHe && i.titleHe.startsWith('תרגום')));
  assert.strictEqual(ts.query({ q: 'מתורגם' }).length, 2, 'חיפוש בעברית מוצא פריטים מתורגמים');
  console.log('בדיקות התרגום עברו ✔');
})().catch((e) => { console.error(e); process.exit(1); });


// ---- מקורות רחבים: Brave ושפות נוספות ----
{
  const { parseBrave } = require('../lib/brave');
  const r = parseBrave({ results: [
    { title: 'Bambu <b>Lab</b> leak', url: 'https://example.com/x', description: 'A &amp; B', page_age: '2026-10-09T10:00:00', meta_url: { hostname: 'www.example.com' } },
    { title: '', url: 'https://example.com/empty' },
    { title: 'no link', url: 'ftp://bad' },
  ] });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].title, 'Bambu Lab leak');
  assert.strictEqual(r[0].summary, 'A & B');
  assert.strictEqual(r[0].publisher, 'example.com');
  assert.deepStrictEqual(parseBrave(null), []);

  const zh = { id: 'gnews-zh', type: 'news', url: 'https://x', requireBambu: true };
  assert.strictEqual(isRelevant(zh, '拓竹发布新款3D打印机', ''), true, 'שם החברה בסינית מזוהה');
  assert.strictEqual(isRelevant(zh, '今日天气', ''), false);
  const forum = { id: 'bambu-forum', type: 'community', url: 'https://forum.bambulab.com/latest.rss', allRelevant: true };
  assert.strictEqual(isRelevant(forum, 'Lid will not close', ''), true);

  const { buildSources } = require('../lib/sources');
  const base = buildSources({}).map((x) => x.id);
  for (const id of ['bambu-forum', 'mastodon-bambulab', 'github-bambustudio', 'reddit-global', 'gnews-de', 'gnews-zh']) assert.ok(base.includes(id), id);
  assert.ok(!base.some((id) => id.startsWith('web-')), 'בלי מפתח אין חיפוש רשת');
  assert.strictEqual(buildSources({ BRAVE_API_KEY: 'k' }).filter((x) => x.api === 'brave').length, 4);
  assert.ok(!buildSources({ NEWS_LANGS: '' }).some((x) => x.id.startsWith('gnews-') && x.id.length === 8));
  console.log('בדיקות מקורות רחבים עברו ✔');
}
