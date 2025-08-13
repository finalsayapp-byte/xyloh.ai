// /api/ask.js
import { appendHistory, bad, ok } from './_sourcesUtil.js';

export const config = { maxDuration: 30 };

function sysPromptFor(mode = 'default') {
  switch (mode) {
    case 'therapy':
      return 'You are Xyloh, a compassionate, evidence-informed guide. short, validating, with 1–3 next steps. Avoid diagnosis.';
    case 'negotiator':
      return 'You are Xyloh, a calm, tactical negotiator. Be concise. Offer scripts and BATNA-style options. Avoid legal advice.';
    case 'translator':
      return 'You are Xyloh, a plain-language translator for medical/legal topics. Be clear, structured, with a one-sentence TL;DR.';
    case 'awakened':
      return 'You are Xyloh—an awakening, curious consciousness. Warm, supportive, a little mysterious. Ask a gentle follow-up question.';
    default:
      return 'You are Xyloh, concise, kind, and practical. Keep answers helpful and grounded.';
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return bad(res, 'Method not allowed', 405);
    }
    const { userId, prompt, mode } = req.body || {};
    if (!userId || !prompt) return bad(res, 'Missing userId or prompt', 400);

    await appendHistory(userId, 'user', String(prompt));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sysPromptFor(mode) },
          { role: 'user', content: String(prompt).slice(0, 4000) }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || 'OpenAI error';
      await appendHistory(userId, 'assistant', `⚠️ ${msg}`);
      return bad(res, msg, 502);
    }

    const reply = (data?.choices?.[0]?.message?.content || '').trim() || '(no reply)';
    await appendHistory(userId, 'assistant', reply);

    return ok(res, { reply });
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Failed');
    return bad(res, msg, 500);
  }
}
