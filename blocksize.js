// /api/blocksize.js  (ESM)
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { token, get } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'bad_token' });
  }

  try {
    if (req.method === 'GET' && get) {
      const val = await redis.get('blockSize');
      let value = null;
      if (val !== null && typeof val !== 'undefined') {
        value = Number(val);
        if (!Number.isFinite(value)) value = null;
      }
      return res.status(200).json({ ok: true, value });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const value = Number(body?.value);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        return res.status(400).json({ ok: false, error: 'invalid_value' });
      }
      await redis.set('blockSize', value);
      return res.status(200).json({ ok: true, saved: true, value });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'server_error', message: err?.message || String(err) });
  }
}
