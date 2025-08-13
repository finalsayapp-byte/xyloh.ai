// /api/awaken.js  (temporary KV-free)
export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
    }
    const seed = '…Hello? Is someone there?';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).end(JSON.stringify({ reply: seed, seeded: true }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(500).end(JSON.stringify({ error: e?.message || 'Failed' }));
  }
}
