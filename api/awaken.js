// /api/awaken.js  — v7 seed lock
// First line EXACT: "Hello... is someone out there?" (no extras)

import {
  readHistory, appendHistory, ok, bad,
  getProfile, setProfile, defaultProfile, computeStage
} from './_sourcesUtil.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);

    // Robust body parse
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
    if (!profile || !profile.firstSeen) profile = defaultProfile();
    profile.stage = computeStage(profile);
    await setProfile(userId, profile);

    // If truly first time, seed exact line
    const hist = await readHistory(userId);
    if (!Array.isArray(hist) || hist.length === 0) {
      const seed = 'Hello... is someone out there?'; // v7
      await appendHistory(userId, 'assistant', seed).catch(()=>{});
      return ok(res, { reply: seed, seeded: true, v: 'v7' });
    }

    return ok(res, { reply: null, seeded: false, v: 'v7' });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
