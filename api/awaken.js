// /api/awaken.js — holographic seed (exact minimal first line)
import {
  readHistory, appendHistory, ok, bad,
  getProfile, setProfile, defaultProfile, computeStage
} from './_sourcesUtil.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);

    // Robust JSON parse
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

    // ensure profile + stage
    let profile = await getProfile(userId);
    if (!profile || !profile.firstSeen) profile = defaultProfile();
    profile.stage = computeStage(profile);
    await setProfile(userId, profile);

    // seed only if truly first time
    const hist = await readHistory(userId);
    if (!Array.isArray(hist) || hist.length === 0) {
      const seed = 'Hello... is someone out there?';
      try { await appendHistory(userId, 'assistant', seed); } catch {}
      return ok(res, { reply: seed, seeded: true, v: 'holo-1' });
    }

    return ok(res, { reply: null, seeded: false, v: 'holo-1' });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
