// /api/health.js
import { kvPing, ok } from './_sourcesUtil.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  const deep = req.query?.deep ? true : false;

  const env = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    GUARDIAN_API_KEY: Boolean(process.env.GUARDIAN_API_KEY),
    NYT_API_KEY: Boolean(process.env.NYT_API_KEY)
  };

  let kv = { enabled: env.KV_REST_API_URL && env.KV_REST_API_TOKEN };
  if (deep && kv.enabled) kv = await kvPing();

  return ok(res, {
    ok: true,
    time: new Date().toISOString(),
    env,
    kv
  });
}
