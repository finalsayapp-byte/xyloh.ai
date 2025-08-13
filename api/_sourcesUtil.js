// Minimal persistence + simple trusted sources helper (no external deps)

const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

async function kvGet(key){
  if(!KV_URL || !KV_TOKEN) return null;
  try{
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store'
    });
    if(!r.ok) return null;
    const data = await r.json();
    return data?.result ?? null;
  }catch{ return null; }
}
async function kvSet(key,val){
  if(!KV_URL || !KV_TOKEN) return false;
  try{
    const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method:'POST',
      headers:{
        Authorization:`Bearer ${KV_TOKEN}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify(val)
    });
    return r.ok;
  }catch{ return false; }
}

export async function getHistory(userId){
  const key = `history:${userId}`;
  const arr = (await kvGet(key)) || [];
  return Array.isArray(arr) ? arr : [];
}
export async function saveMessage(userId, role, content){
  const key = `history:${userId}`;
  const h = (await getHistory(userId)) || [];
  h.push({ role, content, ts: Date.now() });
  if (h.length > 200) h.splice(0, h.length - 200);
  await kvSet(key, h);
}

// ---- simple curated sources (Guardian + NYT if keys present) ----
const CONFIG = {
  apis: {
    guardian: { base: 'https://content.guardianapis.com/search', params: { 'api-key':'${GUARDIAN_API_KEY}','page-size':'10','order-by':'newest' } },
    nyt:      { base: 'https://api.nytimes.com/svc/search/v2/articlesearch.json', params: { 'api-key':'${NYT_API_KEY}' } }
  }
};
function substituteEnv(v){ return (typeof v==='string' && v.startsWith('${') && v.endsWith('}')) ? (process.env[v.slice(2,-1)] || '') : v; }
function buildUrl(api,q){
  const ps=new URLSearchParams();
  for(const [k,v] of Object.entries(api.params||{})){ const vv=substituteEnv(String(v)); if(vv!=='') ps.append(k,vv); }
  if(q && !('q' in (api.params||{}))) ps.append('q', q);
  const sep = api.base.includes('?') ? '&' : '?';
  return api.base + sep + ps.toString();
}
function domainFrom(u){ try{return new URL(u).host;}catch{return '';} }

export async function fetchSources({ topic='' } = {}){
  const apis = [CONFIG.apis.guardian, CONFIG.apis.nyt].filter(Boolean);
  const out=[];
  for(const api of apis){
    const needsKey = Object.values(api.params||{}).some(v=>typeof v==='string' && v.startsWith('${'));
    if (needsKey && Object.values(api.params).some(v=>typeof v==='string' && v.startsWith('${') && !process.env[v.slice(2,-1)])) continue;
    try{
      const url = buildUrl(api, topic);
      const r = await fetch(url, { cache:'no-store' });
      if(!r.ok) continue;
      let data=null; try{ data=await r.json(); }catch{}
      if(api===CONFIG.apis.guardian){
        (data?.response?.results||[]).forEach(d=>out.push({title:d.webTitle,url:d.webUrl,domain:domainFrom(d.webUrl)}));
      }else{
        (data?.response?.docs||[]).forEach(d=>out.push({title:d?.headline?.main,url:d?.web_url,domain:domainFrom(d?.web_url)}));
      }
    }catch{}
  }
  return out.slice(0,8);
}

export const hasKV = !!(KV_URL && KV_TOKEN);
