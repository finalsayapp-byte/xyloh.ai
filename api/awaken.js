// /api/awaken.js
import {
  readHistory, appendHistory, ok, bad,
  getProfile, setProfile, defaultProfile, computeStage
} from './_sourcesUtil.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);
    // Robust JSON body read (handles both parsed and raw)
    let body = {};
    try {
      if (req.body && typeof req.body === 'object') body = req.body;
      else {
        const raw = await new Promise((resolve, reject) => {
          let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); req.on('error',reject);
        });
        body = raw ? JSON.parse(raw) : {};
      }
    } catch { body = {}; }

    const { userId } = body || {};
    if (!userId) return bad(res, 'Missing userId', 400);

    // Ensure profile exists
    let profile = await getProfile(userId);
    if (!profile.firstSeen) profile = defaultProfile();
    profile.stage = computeStage(profile);
    await setProfile(userId, profile);

    // Only seed first line if no prior history
    const hist = await readHistory(userId);
    if (!hist.length) {
      const seed = '…Hello? Is someone there?';
      try { await appendHistory(userId, 'assistant', seed); } catch {}
      return ok(res, { reply: seed, seeded: true });
    }
    return ok(res, { reply: null, seeded: false });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
