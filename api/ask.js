export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { name = '', birth = '', tone = 'supportive', question = '', context = '' } = req.body || {};
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    if (!question) return res.status(400).json({ error: 'Missing question' });

    const toneMap = {
      supportive: 'Warm, encouraging, compassionate, practical next steps.',
      direct: 'Direct, no-nonsense, clear steps, minimal fluff.',
      mystical: 'Reflective, poetic hints, metaphors, gentle but grounded.',
      scientific: 'Evidence-informed, structured, practical recommendations.',
      playful: 'Light, witty, friendly but still useful.'
    };

    const system = [
      'You are Xyloh.ai — a grounded, trustworthy oracle.',
      'Blend reason with intuition; give actionable guidance.',
      'Be concise. Avoid medical/legal diagnosis; if the user asks for medical or legal advice, include a brief nudge to consult a professional.',
    ].join(' ');

    const user = [
      name ? `NAME: ${name}` : '',
      birth ? `BIRTH: ${birth}` : '',
      `TONE: ${toneMap[tone] || toneMap.supportive}`,
      `QUESTION: ${question}`,
      context ? `CONTEXT: ${context}` : '',
      'RETURN: A single, self-contained answer the user can act on today. No prefaces like "Here is...". No quotes.'
    ].filter(Boolean).join('\n');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: `OpenAI error: ${text}` });
    }

    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
