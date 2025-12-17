import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Soporta objetos y strings, evita [object Object]
function normalizeItem(s) {
  if (!s) return null;

  // 1) Si YA viene como objeto desde Redis
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

  // 2) Si viene como string
  if (typeof s === 'string') {
    const str = s.trim();
    if (!str) return null;

    // Puede ser JSON serializado
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
      // no es JSON, seguimos abajo
    }

    // O directamente una URL plana
    return { name: '', url: str };
  }

  return null;
}

async function getBlockSize() {
  const saved = await redis.get('blocksize');
  if (saved) {
    const n = Number(saved);
    if (Number.isInteger(n) && n >= 1 && n <= 20) return n;
  }

  const envN = Number(process.env.BLOCK_SIZE || 2);
  if (Number.isInteger(envN) && envN >= 1 && envN <= 50) return envN;

  return 2;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
  }

  const raw = (await redis.lrange('links', 0, -1)) || [];
  const list = raw.map(normalizeItem).filter(Boolean);

  if (!list.length) {
    return res.status(404).send('No hay enlaces configurados.');
  }

  const blockSize = await getBlockSize();

  let i = Number(await redis.get('rot:i'));
  if (!Number.isInteger(i) || i < 0) i = 0;

  let left = Number(await redis.get('rot:left'));
  if (!Number.isInteger(left) || left <= 0) left = blockSize;

  if (i >= list.length) {
    i = 0;
    left = blockSize;
  }

  const current = list[i];
  const target = current.url;

  // 📊 REGISTRO DE ESTADÍSTICAS POR DÍA (USANDO HORA LOCAL)
  try {
    const now = new Date();

    // Fecha local a las 00:00 del día actual
    const localMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const day = localMidnight.toISOString().slice(0, 10); // YYYY-MM-DD

    await redis.hincrby(`stats:day:${day}`, target, 1);
    await redis.expire(`stats:day:${day}`, 35 * 24 * 60 * 60); // borra después de 35 días
  } catch (e) {
    console.error('Error incrementando stats diarias', e);
  }

  left -= 1;
  if (left <= 0) {
    i = (i + 1) % list.length;
    left = blockSize;
  }

  await redis.set('rot:i', String(i));
  await redis.set('rot:left', String(left));

  res.writeHead(302, { Location: target });
  res.end();
}
