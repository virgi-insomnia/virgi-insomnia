import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// dominios que aceptás (ajustá si querés)
const URL_OK = /^(https?:\/\/)(wa\.me|api\.whatsapp\.com|walink\.[a-z.]+|wame\.[a-z.]+|whatsapp\.com)\/.+/i;

function toCleanString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    // intenta href o value si vinieran objetos del input
    if (typeof v.href === 'string') return v.href.trim();
    if (typeof v.value === 'string') return v.value.trim();
    // último intento: toString seguro
    return String(v).trim();
  }
  return String(v).trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'bad_token' });
  }

  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
    if (!Array.isArray(body)) throw new Error('bad_body');
  } catch {
    return res.status(400).json({ ok: false, error: 'bad_body' });
  }

  // normalización fuerte
  const list = [];
  for (const it of body) {
    // soporta string (solo url) o objeto {name,url}
    let name = '';
    let url = '';

    if (typeof it === 'string') {
      url = toCleanString(it);
    } else if (it && typeof it === 'object') {
      name = toCleanString(it.name || '');
      url  = toCleanString(it.url  || '');
    } else {
      continue;
    }

    // si por algún motivo quedó "[object Object]" lo descartamos
    if (!url || url.toLowerCase() === '[object object]') continue;

    // validación de dominio básico (opcional pero recomendado)
    if (!URL_OK.test(url)) {
      // si no querés bloquear, podés comentar este return y permitir cualquier https
      return res.status(400).json({ ok: false, error: 'invalid_url', url });
    }

    list.push({ name, url });
  }

  if (list.length === 0) {
    return res.status(400).json({ ok: false, error: 'empty_list' });
  }

  // guarda SIEMPRE como JSON string
  await redis.del('links');
  for (const it of list) {
    await redis.rpush('links', JSON.stringify(it));
  }

  return res.json({ ok: true, saved: list.length });
}
