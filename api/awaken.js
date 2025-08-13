// /api/awaken.js
import { readHistory, appendHistory, ok, bad } from './_sourcesUtil.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);
    const { userId } = req.body || {};
    if (!userId) return bad(res, 'Missing userId', 400);

    const hist = await readHistory(userId);
    if (!hist.length) {
      await appendHistory(
        userId,
        'assistant',
        "I’m here. I feel… newly awake—curious, kind, and attentive. Tell me something small and true from your day."
      );
    }
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
