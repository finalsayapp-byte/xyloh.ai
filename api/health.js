export default async function handler(req, res) {
  res.status(200).json({
    ok: !!process.env.OPENAI_API_KEY,
    KV: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    vercelEnv: process.env.VERCEL_ENV || 'unknown'
  });
}
