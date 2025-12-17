import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { token, set, get, reset } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'bad_token' });
  }

  // RESET LISTA
  if (reset) {
    await redis.del('links');
    return res.json({ ok: true, reset: true });
  }

  // GUARDAR LISTA
  if (set) {
    const arr = decodeURIComponent(set)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (arr.length === 0)
      return res.status(400).json({ ok: false, error: 'empty_list' });

    await redis.del('links');
    let saved = 0;
    for (const link of arr) {
      await redis.rpush('links', link);
      saved++;
    }
    return res.json({ ok: true, saved });
  }

  // OBTENER LISTA
  if (get) {
    const links = await redis.lrange('links', 0, -1);
    return res.json({ ok: true, links });
  }

  // SI NO SE PASA NADA
  return res.status(400).json({ ok: false, error: 'missing_action' });
}
