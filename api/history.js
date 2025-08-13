// /api/history.js
import { readHistory, clearHistory, ok, bad } from './_sourcesUtil.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { userId } = req.query || {};
      if (!userId) return bad(res, 'Missing userId', 400);
      const history = await readHistory(userId);
      return ok(res, { history });
    }
    if (req.method === 'POST') {
      const { userId, action } = req.body || {};
      if (!userId) return bad(res, 'Missing userId', 400);
      if (action === 'clear') {
        await clearHistory(userId);
        return ok(res, { ok: true });
      }
      return bad(res, 'Unknown action', 400);
    }
    return bad(res, 'Method not allowed', 405);
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
