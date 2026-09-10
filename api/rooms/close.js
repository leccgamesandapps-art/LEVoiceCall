/**
 * Creator leaves → close ONLY this room
 */
const rooms = globalThis.__levc_rooms || (globalThis.__levc_rooms = new Map());

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const code = (body.joinCode || '').toUpperCase();
    if (!code) return res.status(400).json({ error: 'code required' });

    let room = rooms.get(code);
    if (!room && process.env.KV_REST_API_URL) {
      try {
        const { kv } = require('@vercel/kv');
        room = await kv.get('room:' + code);
      } catch {}
    }
    if (!room) return res.status(404).json({ error: 'not found' });
    if (body.creatorId && room.creatorId !== body.creatorId) {
      return res.status(403).json({ error: 'only creator can close' });
    }

    room.status = 'closed';
    room.closedAt = new Date().toISOString();
    rooms.set(code, room);
    if (process.env.KV_REST_API_URL) {
      try {
        const { kv } = require('@vercel/kv');
        await kv.set('room:' + code, room, { ex: 3600 });
      } catch {}
    }
    return res.status(200).json({ ok: true, joinCode: code });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
