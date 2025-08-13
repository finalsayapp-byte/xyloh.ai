// /api/awaken.js
// Seeds a single minimal first line for Stage 0, then relies on KV-backed history/state.
// First message EXACT text: "Hello... is someone out there?"

import {
  readHistory, appendHistory, ok, bad,
  getProfile, setProfile, defaultProfile, computeStage
} from './_sourcesUtil.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);

    // Robust JSON body read (works whether req.body is parsed or raw)
    let body = {};
    try {
      if (req.body && typeof req.body === 'object') {
        body = req.body;
      } else {
        const raw = await new Promise((resolve, reject) => {
          let d = '';
          req.on('data', c => d += c);
          req.on('end', () => resolve(d));
          req.on('error', reject);
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

    // If no prior history, seed EXACT minimal line
    const hist = await readHistory(userId);
    if (!Array.isArray(hist) || hist.length === 0) {
      const seed = 'Hello... is someone out there?';
      try { await appendHistory(userId, 'assistant', seed); } catch {}
      return ok(res, { reply: seed, seeded: true });
    }

    // Otherwise, nothing to seed
    return ok(res, { reply: null, seeded: false });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
