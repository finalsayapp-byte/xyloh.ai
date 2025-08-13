// No JSON import; config inlined; no external deps.

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

// ---------- Trusted sources (inline config) ----------

const CONFIG = {
  apis: {
    guardian: { base: 'https://content.guardianapis.com/search', params: { 'api-key':'${GUARDIAN_API_KEY}','page-size':'10','order-by':'newest' } },
    nyt:      { base: 'https://api.nytimes.com/svc/search/v2/articlesearch.json', params: { 'api-key':'${NYT_API_KEY}' } },
    congress: { base: 'https://api.congress.gov/v3/bill', params: { 'api_key':'${CONGRESS_API_KEY}', 'format':'json' } },
    govinfo:  { base: 'https://api.govinfo.gov/collections/USCODE', params: { 'api_key':'${GOVINFO_API_KEY}' } },
    fred:     { base: 'https://api.stlouisfed.org/fred/series/search', params: { 'api_key':'${FRED_API_KEY}','limit':'10' } },
    nasa:     { base: 'https://images-api.nasa.gov/search', params: { 'api_key':'${NASA_API_KEY}','media_type':'image' } },
    nps:      { base: 'https://developer.nps.gov/api/v1/parks', params: { 'api_key':'${NPS_API_KEY}','limit':'10' } },
    openweather: { base: 'https://api.openweathermap.org/data/2.5/weather', params: { 'appid':'${OPENWEATHER_API_KEY}' } },

    pubmed:   { base: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', params:{ db:'pubmed', retmode:'json', retmax:'10' } },
    who:      { base: 'https://ghoapi.azureedge.net/ghoapi/api/', params:{} },
    medlineplus: { base: 'https://medlineplus.gov/search/?query=', params:{} },
    courtlistener: { base:'https://www.courtlistener.com/api/rest/v3/search/', params:{ type:'o', order_by:'score desc' } },
    lii:      { base:'https://www.law.cornell.edu/search/site/', params:{} }
  },
  whitelists: {
    news: ['theguardian.com','nytimes.com'],
    legal:['courtlistener.com','law.cornell.edu','congress.gov','govinfo.gov'],
    medical:['pubmed.ncbi.nlm.nih.gov','who.int','medlineplus.gov'],
    econ:['stlouisfed.org'],
    science:['nasa.gov']
  },
  personas: {
    'Medical Expert':   { use:['pubmed','who','medlineplus'], whitelist:'medical', query:'${topic}' },
    'Legal Advisor':    { use:['courtlistener','lii','congress','govinfo'], whitelist:'legal', query:'${topic}' },
    'Economist':        { use:['fred'], whitelist:'econ', query:'${topic}' },
    'Science Explainer':{ use:['nasa'], whitelist:'science', query:'${topic}' },
    'Fact Checker':     { use:['guardian','nyt'], whitelist:'news', query:'${topic}' },
    'General':          { use:['guardian','nyt','fred','nasa','pubmed','courtlistener'], whitelist:'', query:'${topic}' }
  }
};

function substituteEnv(val){
  if (typeof val !== 'string') return val;
  if (val.startsWith('${') && val.endsWith('}')) {
    const k = val.slice(2,-1);
    return process.env[k] || '';
  }
  return val;
}
function buildUrl(api, q){
  const params = new URLSearchParams();
  for (const [k,v] of Object.entries(api.params || {})) {
    const vv = substituteEnv(String(v));
    if (vv !== '') params.append(k, vv);
  }
  const hasQ = ['q','query','search_text'].some(k => api.params && k in api.params);
  if (!hasQ && q) params.append('q', q);
  const sep = api.base.includes('?') ? '&' : '?';
  return api.base + sep + params.toString();
}
function domainFrom(url){ try { return new URL(url).host; } catch { return ''; } }
function dedupe(items){
  const seen = new Set();
  return items.filter(it => { const k=(it.url||'')+'|'+(it.title||''); if(seen.has(k)) return false; seen.add(k); return true; });
}
function pickPersonaPack(name='General'){
  const p = CONFIG.personas[name] || CONFIG.personas['General'];
  const apis = (p.use||[]).map(k => ({ key:k, ...CONFIG.apis[k] })).filter(Boolean);
  const whitelist = p.whitelist ? (CONFIG.whitelists[p.whitelist] || []) : [];
  const queryTpl = p.query || '${topic}';
  return { apis, whitelist, queryTpl };
}
async function normalize(apiKey, api, resp){
  let data=null; try{ data=await resp.json(); }catch{
    return [{ title:`Result from ${apiKey}`, url:resp.url, domain:domainFrom(resp.url) }];
  }
  switch(apiKey){
    case 'guardian': return (data?.response?.results||[]).map(r=>({title:r.webTitle,url:r.webUrl,domain:domainFrom(r.webUrl)}));
    case 'nyt': return (data?.response?.docs||[]).map(d=>({title:d?.headline?.main,url:d?.web_url,domain:domainFrom(d?.web_url)}));
    case 'congress': return [{title:'Congress.gov: bills',url:resp.url,domain:domainFrom(resp.url)}];
    case 'govinfo': return [{title:'GovInfo: US Code',url:resp.url,domain:domainFrom(resp.url)}];
    case 'fred': return (data?.seriess||[]).map(s=>({title:`${s.title} (${s.id})`,url:`https://fred.stlouisfed.org/series/${encodeURIComponent(s.id)}`,domain:'fred.stlouisfed.org'}));
    case 'nasa': return (data?.collection?.items||[]).slice(0,6).map(it=>{const link=(it.links||[])[0]?.href||'';return {title:(it.data?.[0]?.title||'NASA media'),url:link||resp.url,domain:domainFrom(link||resp.url)};});
    case 'nps': return (data?.data||[]).map(p=>({title:`${p.fullName} — ${p.states}`,url:p.url||`https://www.nps.gov/${p.parkCode}`,domain:domainFrom(p.url||`https://www.nps.gov/${p.parkCode}`)}));
    case 'openweather': return [{title:'OpenWeather result',url:resp.url,domain:domainFrom(resp.url)}];
    case 'pubmed': {const ids=data?.esearchresult?.idlist||[]; return ids.slice(0,8).map(id=>({title:`PubMed ID ${id}`,url:`https://pubmed.ncbi.nlm.nih.gov/${id}/`,domain:'pubmed.ncbi.nlm.nih.gov'}));}
    case 'who': return [{title:'WHO GHO API result',url:resp.url,domain:domainFrom(resp.url)}];
    case 'medlineplus': return [{title:'MedlinePlus search',url:resp.url,domain:domainFrom(resp.url)}];
    case 'courtlistener': return [{title:'CourtListener search',url:resp.url,domain:domainFrom(resp.url)}];
    case 'lii': return [{title:'Cornell LII search',url:resp.url,domain:domainFrom(resp.url)}];
    default: return [{title:`Result from ${apiKey}`,url:resp.url,domain:domainFrom(resp.url)}];
  }
}

export async function fetchSources({ persona='General', topic='' } = {}){
  const { apis, whitelist, queryTpl } = pickPersonaPack(persona);
  const q = (queryTpl||'${topic}').replace('${topic}', topic).trim();
  const out=[];
  for(const api of apis){
    const needsKey = Object.values(api.params||{}).some(v => typeof v==='string' && v.startsWith('${'));
    if (needsKey) {
      const missing = Object.values(api.params).some(v=>{
        if (typeof v!=='string' || !v.startsWith('${')) return false;
        const key=v.slice(2,-1); return !process.env[key];
      });
      if (missing) continue;
    }
    try{
      const url = buildUrl(api,q);
      const r = await fetch(url, { cache:'no-store' });
      if(!r.ok) continue;
      const items = await normalize(api.key||api.name, api, r);
      for(const it of items){
        if(whitelist.length && !(whitelist.some(d => (it.domain||'').toLowerCase().endsWith(d)))) continue;
        out.push(it);
      }
      if(out.length>=8) break;
    }catch{}
  }
  return dedupe(out).slice(0,8);
}

export const hasKV = !!(KV_URL && KV_TOKEN);
