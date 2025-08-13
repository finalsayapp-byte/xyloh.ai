// /api/kv-test.js
export const config = { maxDuration: 10 };

function envOk() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/,''),
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { url, token } = envOk();
  if (!url || !token) {
    return res.status(200).end(JSON.stringify({
      ok:false, reason:'missing-url-or-token', url_present: !!url, token_present: !!token
    }));
  }
  const key = `xyloh:kvtest:${Math.random().toString(36).slice(2,8)}`;

  try {
    // SET via path-value, with TTL
    let r = await fetch(`${url}/set/${encodeURIComponent(key)}/1?ex=15`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const setJson = await r.json().catch(()=>null);
    if (!r.ok) return res.status(200).end(JSON.stringify({ ok:false, step:'set', status:r.status, body:setJson }));

    // GET
    r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const getJson = await r.json().catch(()=>null);
    if (!r.ok) return res.status(200).end(JSON.stringify({ ok:false, step:'get', status:r.status, body:getJson }));

    return res.status(200).end(JSON.stringify({ ok: getJson?.result === '1', set:setJson, get:getJson }));
  } catch (e) {
    return res.status(200).end(JSON.stringify({ ok:false, error:String(e?.message||e) }));
  }
}
