// פרסר RSS/Atom קטן בלי תלויות חיצוניות

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENT[m] ?? m);
}

function safeChar(code) {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

function stripTags(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

// מחזיר טקסט נקי מתוכן תג (כולל CDATA ו-HTML מוסתר)
function cleanText(raw) {
  if (!raw) return '';
  let s = raw;
  const cdata = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  s = cdata ? s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : decodeEntities(s);
  s = stripTags(s);
  s = decodeEntities(s);
  s = stripTags(s); // שכבה שנייה למקרה של HTML שהוסתר פעמיים
  return s.replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  let best = null;
  for (const attrs of links) {
    const href = (attrs.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const rel = (attrs.match(/rel=["']([^"']+)["']/i) || [])[1];
    if (!rel || rel === 'alternate') return decodeEntities(href);
    best = best || decodeEntities(href);
  }
  return best || '';
}

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const title = cleanText(tag(block, 'title'));
    let link = cleanText(tag(block, 'link')) || atomLink(block);
    if (!link) link = cleanText(tag(block, 'guid'));
    const dateRaw =
      cleanText(tag(block, 'pubDate')) ||
      cleanText(tag(block, 'published')) ||
      cleanText(tag(block, 'updated')) ||
      cleanText(tag(block, 'dc:date'));
    const summary = cleanText(
      tag(block, 'content:encoded') || tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'),
    );
    const publisher = cleanText(tag(block, 'source')) || cleanText(tag(block, 'media:credit'));
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, dateRaw, summary, publisher });
  }
  return items;
}

module.exports = { parseFeed, cleanText };
