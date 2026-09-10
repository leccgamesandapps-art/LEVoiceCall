/**
 * LEVoiceCall Rooms API
 * Uses in-memory + optional Vercel KV. Rooms are isolated by joinCode.
 */
const rooms = globalThis.__levc_rooms || (globalThis.__levc_rooms = new Map());
const signals = globalThis.__levc_signals || (globalThis.__levc_signals = new Map());

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const code = (req.query.code || '').toUpperCase();
      if (!code) return res.status(400).json({ error: 'code required' });
      let room = rooms.get(code);
      if (!room && process.env.KV_REST_API_URL) {
        try {
          const { kv } = require('@vercel/kv');
          room = await kv.get('room:' + code);
        } catch {}
      }
      if (!room) return res.status(404).json({ error: 'not found' });
      return res.status(200).json(room);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.joinCode) return res.status(400).json({ error: 'invalid body' });
      const code = body.joinCode.toUpperCase();
      body.joinCode = code;
      body.status = body.status || 'active';
      rooms.set(code, body);
      if (process.env.KV_REST_API_URL) {
        try {
          const { kv } = require('@vercel/kv');
          await kv.set('room:' + code, body, { ex: 86400 });
        } catch {}
      }
      return res.status(201).json(body);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const code = (body.joinCode || '').toUpperCase();
      if (!code) return res.status(400).json({ error: 'joinCode required' });
      rooms.set(code, body);
      if (process.env.KV_REST_API_URL) {
        try {
          const { kv } = require('@vercel/kv');
          await kv.set('room:' + code, body, { ex: 86400 });
        } catch {}
      }
      return res.status(200).json(body);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
