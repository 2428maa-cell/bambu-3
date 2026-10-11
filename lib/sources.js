// רשימת המקורות. אפשר להוסיף עוד דרך משתני סביבה (ראה README).
// interval = כל כמה שניות לבדוק את המקור (אפשר לדרוס הכל עם POLL_SECONDS).

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// Google News בשפות נוספות: [hl, gl, ceid]
const GN_LANGS = {
  de: ['de', 'DE', 'DE:de'],
  ja: ['ja', 'JP', 'JP:ja'],
  zh: ['zh-CN', 'CN', 'CN:zh-Hans'],
  fr: ['fr', 'FR', 'FR:fr'],
  es: ['es', 'ES', 'ES:es'],
  he: ['iw', 'IL', 'IL:iw'],
  ru: ['ru', 'RU', 'RU:ru'],
  ko: ['ko', 'KR', 'KR:ko'],
  pt: ['pt-BR', 'BR', 'BR:pt-419'],
};
const gnewsLang = (q, lang) => {
  const [hl, gl, ceid] = GN_LANGS[lang];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
};

const base = [
  // --- קהילה (Reddit) ---
  {
    id: 'reddit-bambulab',
    name: 'Reddit r/BambuLab',
    type: 'community',
    url: 'https://www.reddit.com/r/BambuLab/new/.rss',
    interval: 90,
  },
  {
    id: 'reddit-bambulab-rumors',
    name: 'Reddit r/BambuLab (שמועות)',
    type: 'community',
    url: 'https://www.reddit.com/r/BambuLab/search.rss?q=rumor+OR+leak+OR+upcoming+OR+teaser+OR+patent&restrict_sr=1&sort=new&t=month',
    interval: 120,
  },
  {
    id: 'reddit-3dprinting',
    name: 'Reddit r/3Dprinting',
    type: 'community',
    url: 'https://www.reddit.com/r/3Dprinting/search.rss?q=bambu&restrict_sr=1&sort=new&t=week',
    requireBambu: true,
    interval: 150,
  },

  // --- חדשות ---
  { id: 'gnews-main', name: 'Google News', type: 'news', url: gnews('"Bambu Lab"'), interval: 90 },
  {
    id: 'gnews-rumors',
    name: 'Google News (שמועות)',
    type: 'news',
    url: gnews('"Bambu Lab" (rumor OR leak OR upcoming OR teaser OR patent OR FCC)'),
    interval: 120,
  },
  {
    id: 'gnews-launch',
    name: 'Google News (השקות)',
    type: 'news',
    url: gnews('Bambu Lab new printer launch OR announced OR release'),
    interval: 180,
  },
  {
    id: 'bing-news',
    name: 'Bing News',
    type: 'news',
    url: 'https://www.bing.com/news/search?q=%22Bambu+Lab%22&format=rss',
    interval: 180,
  },
  {
    id: 'hn',
    name: 'Hacker News',
    type: 'community',
    url: 'https://hnrss.org/newest?q=%22bambu+lab%22&count=30',
    interval: 120,
  },

  // --- פורומים ורשתות פתוחות ---
  {
    id: 'bambu-forum',
    name: 'הפורום הרשמי של Bambu Lab',
    type: 'community',
    url: 'https://forum.bambulab.com/latest.rss',
    allRelevant: true,
    interval: 120,
  },
  {
    id: 'reddit-global',
    name: 'Reddit (חיפוש בכל הקהילות)',
    type: 'community',
    url: 'https://www.reddit.com/search.rss?q=%22bambu+lab%22+(rumor+OR+leak+OR+teaser+OR+upcoming)&sort=new&t=week',
    requireBambu: true,
    interval: 180,
  },
  {
    id: 'mastodon-bambulab',
    name: 'Mastodon #bambulab',
    type: 'community',
    url: 'https://mastodon.social/tags/bambulab.rss',
    requireBambu: true,
    interval: 180,
  },
  {
    id: 'mastodon-bambustudio',
    name: 'Mastodon #bambustudio',
    type: 'community',
    url: 'https://mastodon.social/tags/bambustudio.rss',
    interval: 300,
  },
  {
    id: 'github-bambustudio',
    name: 'GitHub: Bambu Studio (גרסאות)',
    type: 'official',
    official: true,
    url: 'https://github.com/bambulab/BambuStudio/releases.atom',
    interval: 300,
  },

  // --- רשמי ---
  {
    id: 'bambu-blog',
    name: 'Bambu Lab Blog (רשמי)',
    type: 'official',
    official: true,
    url: 'https://blog.bambulab.com/rss/',
    interval: 300,
  },
];

function buildSources(env = process.env) {
  const list = base.map((s) => ({ ...s }));

  // ערוצי יוטיוב: YOUTUBE_CHANNEL_IDS=UCxxxx,UCyyyy
  for (const id of (env.YOUTUBE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    list.push({
      id: `yt-${id}`,
      name: `YouTube ${id}`,
      type: 'video',
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
      interval: 300,
    });
  }

  // חדשות בשפות נוספות. NEWS_LANGS=de,ja,zh,fr,es,he,ru,ko,pt (ריק = בלי)
  const langs = (env.NEWS_LANGS === undefined ? 'de,ja,zh,fr,es,he' : env.NEWS_LANGS)
    .split(',').map((x) => x.trim()).filter((l) => GN_LANGS[l]);
  for (const l of langs) {
    list.push({
      id: `gnews-${l}`,
      name: `Google News (${l})`,
      type: 'news',
      url: gnewsLang(l === 'zh' ? '("Bambu Lab" OR 拓竹)' : '"Bambu Lab"', l),
      requireBambu: true,
      interval: 300,
    });
  }

  // חיפוש רשת רחב (כל האינטרנט) דרך Brave Search API. דורש BRAVE_API_KEY.
  if (env.BRAVE_API_KEY) {
    const queries = ['"Bambu Lab" rumor', '"Bambu Lab" leak', '"Bambu Lab" upcoming OR announced', 'Bambu Lab new printer'];
    queries.forEach((q, i) => {
      list.push({ id: `web-${i}`, name: 'חיפוש רשת', type: 'news', api: 'brave', query: q, requireBambu: true, interval: 600 });
    });
  }

  // פידים נוספים: EXTRA_FEEDS=שם|כתובת|סוג;שם|כתובת|סוג
  for (const entry of (env.EXTRA_FEEDS || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [name, url, type] = entry.split('|').map((x) => (x || '').trim());
    if (!name || !/^https?:\/\//.test(url || '')) continue;
    list.push({
      id: `extra-${list.length}`,
      name,
      type: type || 'news',
      url,
      requireBambu: true,
      interval: 180,
    });
  }

  // דריסת תדירות גלובלית (מינימום 5 שניות כדי לא להיחסם)
  const forced = Number(env.POLL_SECONDS);
  if (forced > 0) {
    for (const s of list) s.interval = Math.max(5, forced);
  }
  return list;
}

module.exports = { buildSources };
