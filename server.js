const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./lib/env');
loadEnv();

const { Store } = require('./lib/store');
const { Collector } = require('./lib/collector');
const { buildSources } = require('./lib/sources');
const chat = require('./lib/chat');
const { Translator } = require('./lib/translate');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname,'lib',  'public');

const store = new Store();
store.load();
const collector = new Collector(buildSources(), store);
const translator = new Translator(store);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---- SSE: דחיפת פריטים חדשים לכל הדפדפנים המחוברים ----
const clients = new Set();
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
store.on('items', (added) => {
  for (const res of clients) sseSend(res, 'items', added);
});
translator.on('translated', (list) => {
  for (const res of clients) sseSend(res, 'translated', list);
});
setInterval(() => {
  const status = collector.status();
  for (const res of clients) sseSend(res, 'status', status);
}, 1000);
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 20000);

// ---- הגבלת קצב לצ'אט (הגנה על העלות) ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > Number(process.env.CHAT_PER_MINUTE || 15);
}
setInterval(() => hits.clear(), 10 * 60000).unref();

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname, searchParams } = url;
  try {
    if (req.method === 'GET' && pathname === '/api/items') {
      const items = store.query({
        kind: searchParams.get('kind') || 'all',
        q: searchParams.get('q') || '',
        topic: searchParams.get('topic') || '',
        limit: Number(searchParams.get('limit')) || 60,
        before: Number(searchParams.get('before')) || 0,
      });
      return json(res, 200, { items, counts: store.counts() });
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      return json(res, 200, {
        ...collector.status(),
        aiEnabled: chat.hasKey(),
        translation: translator.enabled() ? { enabled: true, pending: translator.pending() } : { enabled: false },
      });
    }

    if (req.method === 'GET' && pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      sseSend(res, 'status', collector.status());
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (rateLimited(ip)) return json(res, 429, { error: 'יותר מדי הודעות, נסה שוב בעוד דקה.' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
        .slice(-10);
      if (!history.length || history[history.length - 1].role !== 'user') {
        return json(res, 400, { error: 'חסרה שאלה' });
      }
      try {
        return json(res, 200, await chat.answer(store, history));
      } catch (e) {
        console.error('chat error:', e.message);
        return json(res, 502, { error: 'התשובה נכשלה. נסה שוב עוד רגע.' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/refresh') {
      const token = process.env.ADMIN_TOKEN;
      if (token && req.headers['x-admin-token'] !== token) return json(res, 401, { error: 'unauthorized' });
      collector.refreshAll();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET') return serveStatic(req, res, pathname);
    res.writeHead(405);
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'שגיאת שרת' });
  }
});

server.listen(PORT, () => {
  console.log(`Bambu Radar רץ על http://localhost:${PORT}`);
  console.log(chat.hasKey() ? 'צ\'אט AI: פעיל' : 'צ\'אט AI: כבוי (הגדר ANTHROPIC_API_KEY ב-.env)');
  console.log(translator.enabled() ? 'תרגום לעברית: פעיל' : 'תרגום לעברית: כבוי (דורש ANTHROPIC_API_KEY)');
  collector.start();
  translator.start();
});

process.on('SIGTERM', () => { collector.stop(); server.close(() => process.exit(0)); });
