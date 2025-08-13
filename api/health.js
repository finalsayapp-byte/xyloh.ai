// /api/health.js
import { kvPing, ok } from './_sourcesUtil.js';

export const config = { maxDuration: 5 };

export default async function handler(req, res) {
  const deep = (req.query?.deep || '').toString() === '1' || (req.query?.deep || '').toString() === 'true';
  const kv = await kvPing();
  const env = deep ? {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    KV_REST_API_URL: !!process.env.KV_REST_API_URL || !!process.env.UPSTASH_REDIS_REST_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN || !!process.env.UPSTASH_REDIS_REST_TOKEN
  } : undefined;

  return ok(res, {
    ok: true,
    time: new Date().toISOString(),
    env,
    kv
  });
}
