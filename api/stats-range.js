import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function normalizeItem(s) {
  if (!s) return null;

  if (typeof s === 'object') {
    const o = s;
    if (typeof o.url === 'string' && o.url.trim()) {
      return {
        name: typeof o.name === 'string' ? o.name : '',
        url: o.url.trim(),
      };
    }
    if (typeof o.link === 'string' && o.link.trim()) {
      return {
        name: typeof o.name === 'string' ? o.name : '',
        url: o.link.trim(),
      };
    }
    return null;
  }

  if (typeof s === 'string') {
    const str = s.trim();
    if (!str) return null;

    try {
      const o = JSON.parse(str);
      if (
        o &&
        typeof o === 'object' &&
        typeof o.url === 'string' &&
        o.url.trim()
      ) {
        return {
          name: typeof o.name === 'string' ? o.name : '',
          url: o.url.trim(),
        };
      }
    } catch {
      // no es JSON, seguimos
    }

    return { name: '', url: str };
  }

  return null;
}

function getDayString(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getRangeDates(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === 'today') {
    return [getDayString(today)];
  }

  if (range === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return [getDayString(y)];
  }

  if (range === 'week') {
    // Semana actual (lunes a hoy)
    const day = today.getDay(); // 0=domingo, 1=lunes,...
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);

    const days = [];
    const cursor = new Date(monday);
    while (cursor <= today) {
      days.push(getDayString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  if (range === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const days = [];
    const cursor = new Date(first);
    while (cursor <= today) {
      days.push(getDayString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  // Si mandan algo raro, devolvemos solo hoy
  return [getDayString(today)];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { token, range = 'today' } = req.query;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res
      .status(401)
      .json({ ok: false, error: 'bad_token' });
  }

  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    // Leemos la lista de cajeras para mapear URL -> nombre
    const raw = (await redis.lrange('links', 0, -1)) || [];
    const list = raw.map(normalizeItem).filter(Boolean);

    const urlToName = {};
    for (const item of list) {
      if (item.url) {
        urlToName[item.url] = item.name || '';
      }
    }

    const days = getRangeDates(range);
    const totals = {}; // url -> count total

    for (const day of days) {
      const key = `stats:day:${day}`;
      const hash = await redis.hgetall(key);
      if (!hash) continue;

      // hash es { url1: "10", url2: "3", ... }
      for (const [url, countStr] of Object.entries(hash)) {
        const c = Number(countStr || 0);
        if (!c) continue;
        totals[url] = (totals[url] || 0) + c;
      }
    }

    const stats = [];
    let totalAll = 0;

    for (const [url, count] of Object.entries(totals)) {
      totalAll += count;
      stats.push({
        name: urlToName[url] || 'Sin nombre',
        url,
        count,
      });
    }

    // Ordenamos de mayor a menor
    stats.sort((a, b) => b.count - a.count);

    return res.json({
      ok: true,
      range,
      total: totalAll,
      stats,
    });
  } catch (err) {
    console.error('Error en /api/stats-range', err);
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
}
