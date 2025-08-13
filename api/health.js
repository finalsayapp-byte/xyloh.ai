// /api/health.js
// Bulletproof health endpoint with optional deep checks.
//
// Usage:
//   /api/health               -> fast env check (no external calls)
//   /api/health?deep=1        -> also pings KV (set/get) and does a tiny OpenAI probe
//
// Notes:
// - Deep checks are wrapped in try/catch so failures won’t crash the route.
// - OpenAI probe is minimal: it requests a short completion and never throws on failure;
//   it just reports openaiReachable = false if the call fails.

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const deep = url.searchParams.get('deep') === '1';

  const env = {
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'unknown'
  };

  // Env presence checks (fast)
  const presence = {
    openaiKey: !!process.env.OPENAI_API_KEY,
    kvConfigured: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    guardianKey: !!process.env.GUARDIAN_API_KEY,
    nytKey: !!process.env.NYT_API_KEY
  };

  // Defaults for deep results
  const kv = { reachable: false, read: false, wrote: false };
  const openai = { reachable: false, model: 'gpt-4o-mini' };

  if (deep) {
    // ---- KV deep probe (set + get on a temp key) ----
    try {
      if (presence.kvConfigured) {
        const base = process.env.KV_REST_API_URL;
        const token = process.env.KV_REST_API_TOKEN;
        const k = `health:probe:${Date.now()}`;

        // write
        const w = await fetch(`${base}/set/${encodeURIComponent(k)}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ok: true, ts: Date.now() })
        });
        kv.wrote = w.ok;

        // read
        const r = await fetch(`${base}/get/${encodeURIComponent(k)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          cache: 'no-store'
        });
        if (r.ok) {
          const data = await r.json().catch(() => null);
          kv.read = !!(data && (data.result || data.result === 0 || data.result === false));
        }
        kv.reachable = kv.wrote || kv.read;
      }
    } catch {
      // keep defaults
    }

    // ---- OpenAI deep probe (tiny request) ----
    try {
      if (presence.openaiKey) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: openai.model,
            messages: [
              { role: 'system', content: 'You are a health-check. Reply with "ok".' },
              { role: 'user', content: 'ping' }
            ],
            max_tokens: 2,
            temperature: 0
          })
        });
        if (r.ok) {
          const data = await r.json().catch(() => null);
          const txt = data?.choices?.[0]?.message?.content || '';
          openai.reachable = typeof txt === 'string';
        }
      }
    } catch {
      // keep defaults
    }
  }

  res.status(200).json({
    ok: presence.openaiKey,          // basic "ready to reply" flag
    KV: presence.kvConfigured,       // KV envs present
    sources: {
      guardianKey: presence.guardianKey,
      nytKey: presence.nytKey
    },
    deep,                            // whether we ran deep checks
    kv,                              // deep KV results
    openai,                          // deep OpenAI results
    env                               // environment metadata
  });
}
