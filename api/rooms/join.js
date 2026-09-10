/**
 * Join a specific room by code — adds participant only to that room
 */
const rooms = globalThis.__levc_rooms || (globalThis.__levc_rooms = new Map());

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const code = (body.joinCode || '').toUpperCase();
    const participant = body.participant;
    if (!code || !participant?.id) return res.status(400).json({ error: 'invalid' });

    let room = rooms.get(code);
    if (!room && process.env.KV_REST_API_URL) {
      try {
        const { kv } = require('@vercel/kv');
        room = await kv.get('room:' + code);
      } catch {}
    }
    if (!room) return res.status(404).json({ error: 'not found' });
    if (room.status !== 'active') return res.status(410).json({ error: 'closed' });

    if (!room.participants.find(p => p.id === participant.id)) {
      room.participants.push(participant);
    }
    rooms.set(code, room);
    if (process.env.KV_REST_API_URL) {
      try {
        const { kv } = require('@vercel/kv');
        await kv.set('room:' + code, room, { ex: 86400 });
      } catch {}
    }
    return res.status(200).json(room);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
