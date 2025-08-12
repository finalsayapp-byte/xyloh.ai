export default async function handler(req, res) {
  const haveOpenAI = !!process.env.OPENAI_API_KEY;
  const vercelEnv = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const from = req.headers['x-vercel-deployment-url'] || req.headers.host || '';
  const ok = haveOpenAI;
  res.status(ok ? 200 : 500).json({
    ok,
    haveOpenAI,
    vercelEnv,
    from,
    tip: haveOpenAI ? 'All good.' : 'Set OPENAI_API_KEY in Project → Settings → Environment Variables (Production) and redeploy.'
  });
}
