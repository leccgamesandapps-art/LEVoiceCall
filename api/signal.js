/**
 * WebRTC signaling store (per-room queues)
 */
const queues = globalThis.__levc_sig || (globalThis.__levc_sig = new Map());

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const code = (body.code || '').toUpperCase();
      if (!code) return res.status(400).json({ error: 'code required' });
      if (!queues.has(code)) queues.set(code, []);
      const q = queues.get(code);
      q.push({ ...body, ts: Date.now(), delivered: [] });
      while (q.length > 80) q.shift();
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const code = (req.query.code || '').toUpperCase();
      const user = req.query.user || '';
      if (!code) return res.status(400).json({ error: 'code required' });
      const q = queues.get(code) || [];
      const now = Date.now();
      const alive = q.filter((m) => now - (m.ts || 0) < 90000);
      queues.set(code, alive);

      const forUser = [];
      for (const m of alive) {
        if (m.from === user) continue;
        if (m.to && m.to !== user) continue;
        const delivered = m.delivered || [];
        if (delivered.includes(user)) continue;
        forUser.push(m);
        delivered.push(user);
        m.delivered = delivered;
      }
      return res.status(200).json(forUser);
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
