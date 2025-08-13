let memory = new Map();

function haveKV(){
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
         !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function kvGet(key){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers:{ Authorization:`Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || j.result == null) return null;
  try{ return JSON.parse(j.result); }catch{ return j.result; }
}
async function kvSet(key, value){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  await fetch(`${url}/set/${encodeURIComponent(key)}`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body });
}

export async function getStore(){
  if (haveKV()) {
    return {
      async get(k){ return await kvGet(k); },
      async set(k,v){ return await kvSet(k,v); }
    };
  }
  // Fallback (non-persistent across cold starts)
  return {
    async get(k){ return memory.get(k) || null; },
    async set(k,v){ memory.set(k,v); }
  };
}
