// חיפוש רשת רחב דרך Brave Search API (אופציונלי, דורש BRAVE_API_KEY).
// מחזיר תוצאות חדשות מכל האינטרנט, לא רק ממקורות קבועים.
const { cleanText } = require('./rss');

function parseBrave(json) {
  const arr = Array.isArray(json && json.results) ? json.results : [];
  return arr
    .map((r) => ({
      title: cleanText(r.title || ''),
      link: r.url || '',
      dateRaw: r.page_age || '',
      summary: cleanText(r.description || ''),
      publisher: r.meta_url && r.meta_url.hostname ? String(r.meta_url.hostname).replace(/^www\./, '') : '',
    }))
    .filter((x) => x.title && /^https?:\/\//.test(x.link));
}

async function fetchBrave(source) {
  const u = new URL('https://api.search.brave.com/res/v1/news/search');
  u.searchParams.set('q', source.query);
  u.searchParams.set('freshness', 'pw');
  u.searchParams.set('count', '20');
  const res = await fetch(u, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseBrave(await res.json());
}

module.exports = { parseBrave, fetchBrave };
