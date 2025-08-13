export default async function handler(req, res){
  const env = {
    haveOpenAI: !!process.env.OPENAI_API_KEY,
    GUARDIAN: !!process.env.GUARDIAN_API_KEY,
    NYT: !!process.env.NYT_API_KEY,
    CONGRESS: !!process.env.CONGRESS_API_KEY,
    GOVINFO: !!process.env.GOVINFO_API_KEY,
    FRED: !!process.env.FRED_API_KEY,
    NASA: !!process.env.NASA_API_KEY,
    NPS: !!process.env.NPS_API_KEY,
    OPENWEATHER: !!process.env.OPENWEATHER_API_KEY,
    KV: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)
  };
  const ok = env.haveOpenAI;
  res.status(ok?200:500).json({ ok, ...env, vercelEnv: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown' });
}
