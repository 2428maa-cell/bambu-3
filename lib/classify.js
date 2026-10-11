// סיווג פריטים: רשמי / שמועה / חדשות / קהילה / וידאו + תיוג מוצרים

// [תבנית, משקל]. התאמה בכותרת נספרת פי 2.
const RUMOR_PATTERNS = [
  [/rumou?rs?\b|rumou?red/i, 3],
  [/\bleak(ed|s|ing)?\b/i, 3],
  [/\bteas(er|ers|ed|ing)\b/i, 2],
  [/patent/i, 2],
  [/\bfcc\b|certification|\bfiling\b|\bcertified\b/i, 2],
  [/reportedly|allegedly|insider|sources say|according to sources/i, 2],
  [/speculat|\bprediction|\bpredict/i, 2],
  [/unannounced|unreleased|unconfirmed|not yet announced/i, 2],
  [/\bupcoming\b|next[- ]gen|successor|coming soon/i, 1],
  [/expected to|could launch|may launch|might (launch|release|be)/i, 1],
  [/spotted|sneak peek|\bhints?\b|\bhinted\b/i, 1],
];

const TOPICS = [
  ['H2D', /\bh2d\b/i],
  ['H2S', /\bh2s\b/i],
  ['H2C', /\bh2c\b/i],
  ['P2S', /\bp2s\b/i],
  ['P1S', /\bp1s\b/i],
  ['P1P', /\bp1p\b/i],
  ['X1', /\bx1[ce]?\b/i],
  ['A1', /\ba1(?!\s*mini)\b/i],
  ['A1 mini', /\ba1[ -]?mini\b/i],
  ['AMS', /\bams\b/i],
  ['Bambu Studio', /bambu\s*studio/i],
  ['MakerWorld', /makerworld/i],
  ['Filament', /filament/i],
  ['Laser', /\blaser\b|\bcutter\b/i],
  ['Firmware', /firmware|authori[sz]ation|\bauth\b/i],
  ['מחירים/מכסים', /tariff|\bprice|pricing|discount/i],
];

// כולל שמות החברה בסינית (拓竹), ביפנית ובתעתיק, לכיסוי חדשות בשפות נוספות
const BAMBU_RE = /bambu|拓竹|バンブーラボ|tuozhu|뱀부랩/i;
const BAMBU_PRODUCT_RE = /\b(h2[dsc]|p[12][sp]|x1[ce]?|a1(?:\s*mini)?)\b/i;

function scoreRumor(title, summary) {
  let score = 0;
  for (const [re, w] of RUMOR_PATTERNS) {
    if (re.test(title)) score += w * 2;
    else if (re.test(summary)) score += w;
  }
  return score;
}

function topicsOf(text) {
  return TOPICS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function isRelevant(source, title, summary) {
  const text = `${title} ${summary}`;
  if (source.requireBambu) return BAMBU_RE.test(text);
  if (source.official || source.allRelevant || /reddit\.com\/r\/BambuLab/i.test(source.url || '')) return true;
  return BAMBU_RE.test(text) || BAMBU_PRODUCT_RE.test(text);
}

function classify(source, item) {
  const score = scoreRumor(item.title, item.summary);
  let kind;
  if (source.official) kind = score >= 5 ? 'rumor' : 'official';
  else if (score >= 3) kind = 'rumor';
  else if (source.type === 'community') kind = 'community';
  else if (source.type === 'video') kind = 'video';
  else kind = 'news';
  return { kind, score, topics: topicsOf(`${item.title} ${item.summary}`) };
}

module.exports = { classify, isRelevant, scoreRumor, topicsOf };
