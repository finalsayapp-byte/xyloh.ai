// /api/profile.js
import { getProfile, setProfile, eraseAll, ok, bad } from './_sourcesUtil.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { userId } = req.query || {};
      if (!userId) return bad(res, 'Missing userId', 400);
      const profile = await getProfile(userId);
      return ok(res, { profile });
    }
    if (req.method === 'POST') {
      const { userId, update, action } = req.body || {};
      if (!userId) return bad(res, 'Missing userId', 400);
      if (action === 'erase') {
        await eraseAll(userId);
        return ok(res, { ok: true });
      }
      if (update && typeof update === 'object') {
        const p = await getProfile(userId);
        const merged = { ...p, ...update };
        await setProfile(userId, merged);
        return ok(res, { ok: true });
      }
      return bad(res, 'Nothing to update', 400);
    }
    return bad(res, 'Method not allowed', 405);
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
