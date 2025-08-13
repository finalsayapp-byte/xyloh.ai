// api/_sourcesUtil.js
// Uses JSON import with the modern attribute syntax.
// Note: Vercel compiles ESM to CJS but supports `with { type: 'json' }`.

import configJson from '../public/sources.config.json' with { type: 'json' };

// ------- Upstash KV (persistence) -------

const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null; // no persistence in this environment
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Public helpers used by other API routes
export async function getHistory(userId) {
  const key = `history:${userId}`;
  const arr = (await kvGet(key)) || [];
  return Array.isArray(arr) ? arr : [];
}

export async function saveMessage(userId, role, content) {
  const key = `history:${userId}`;
  const h = (await getHistory(userId)) || [];
  h.push({ role, content, ts: Date.now() });
  // keep a reasonable cap to avoid unbounded growth
  if (h.length > 200) h.splice(0, h.length - 200);
  await kvSet(key, h);
}

// ------- Trusted source fetching / persona packs -------

function substituteEnv(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('${') && val.endsWith('}')) {
    const k = val.slice(2, -1);
    return process.env[k] || '';
  }
  return val;
}

function buildUrl(api, q) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(api.params || {})) {
    const vv = substituteEnv(String(v));
    if (vv !== '') params.append(k, vv);
  }

  // add query if the API didn't already specify a query param key
  const hasQ = ['q', 'query', 'search_text'].some(
    (k) => api.params && k in api.params
  );
  if (!hasQ && q) params.append('q', q);

  const sep = api.base.includes('?') ? '&' : '?';
  return api.base + sep + params.toString();
}

function domainFrom(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const k = (it.url || '') + '|' + (it.title || '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function pickPersonaPack(personaName = 'General') {
  const p = configJson.personas?.[personaName] || configJson.personas?.General || {
    use: ['guardian', 'nyt'],
    whitelist: 'news',
    query: '${topic}',
  };

  const apis = (p.use || [])
    .map((k) => ({ key: k, ...(configJson.apis?.[k] || {}) }))
    .filter((x) => x && x.base);

  const whitelist =
    p.whitelist && configJson.whitelists?.[p.whitelist]
      ? configJson.whitelists[p.whitelist]
      : [];

  const queryTpl = p.query || '${topic}';
  return { apis, whitelist, queryTpl };
}

async function normalize(apiKey, api, resp) {
  // Attempt to parse JSON, but some endpoints are just redirects/HTML
  let data = null;
  try {
    data = await resp.json();
  } catch {
    // ignore parse errors; return a generic ref
    return [{ title: `Result from ${apiKey}`, url: resp.url, domain: domainFrom(resp.url) }];
  }

  switch (apiKey) {
    case 'guardian':
      return (data?.response?.results || []).map((r) => ({
        title: r.webTitle,
        url: r.webUrl,
        domain: domainFrom(r.webUrl),
      }));
    case 'nyt':
      return (data?.response?.docs || []).map((d) => ({
        title: d?.headline?.main,
        url: d?.web_url,
        domain: domainFrom(d?.web_url),
      }));
    case 'congress':
      return [{ title: 'Congress.gov: bills', url: resp.url, domain: domainFrom(resp.url) }];
    case 'govinfo':
      return [{ title: 'GovInfo: US Code', url: resp.url, domain: domainFrom(resp.url) }];
    case 'fred':
      return (data?.seriess || []).map((s) => ({
        title: `${s.title} (${s.id})`,
        url: `https://fred.stlouisfed.org/series/${encodeURIComponent(s.id)}`,
        domain: 'fred.stlouisfed.org',
      }));
    case 'nasa':
      return (data?.collection?.items || [])
        .slice(0, 6)
        .map((it) => {
          const link = (it.links || [])[0]?.href || '';
          return {
            title: it.data?.[0]?.title || 'NASA media',
            url: link || resp.url,
            domain: domainFrom(link || resp.url),
          };
        });
    case 'nps':
      return (data?.data || []).map((p) => ({
        title: `${p.fullName} — ${p.states}`,
        url: p.url || `https://www.nps.gov/${p.parkCode}`,
        domain: domainFrom(p.url || `https://www.nps.gov/${p.parkCode}`),
      }));
    case 'openweather':
      return [{ title: 'OpenWeather result', url: resp.url, domain: domainFrom(resp.url) }];
    case 'pubmed': {
      const ids = data?.esearchresult?.idlist || [];
      return ids.slice(0, 8).map((id) => ({
        title: `PubMed ID ${id}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        domain: 'pubmed.ncbi.nlm.nih.gov',
      }));
    }
    case 'who':
      return [{ title: 'WHO GHO API result', url: resp.url, domain: domainFrom(resp.url) }];
    case 'medlineplus':
      return [{ title: 'MedlinePlus search', url: resp.url, domain: domainFrom(resp.url) }];
    case 'courtlistener':
      return [{ title: 'CourtListener search', url: resp.url, domain: domainFrom(resp.url) }];
    case 'lii':
      return [{ title: 'Cornell LII search', url: resp.url, domain: domainFrom(resp.url) }];
    default:
      return [{ title: `Result from ${apiKey}`, url: resp.url, domain: domainFrom(resp.url) }];
  }
}

/**
 * Fetches trusted external sources based on persona pack + topic.
 * Skips APIs whose required keys are missing from env.
 * Returns up to 8 deduped items: { title, url, domain }
 */
export async function fetchSources({ persona = 'General', topic = '' } = {}) {
  const { apis, whitelist, queryTpl } = pickPersonaPack(persona);
  const q = (queryTpl || '${topic}').replace('${topic}', topic).trim();

  const out = [];

  for (const api of apis) {
    // If this API needs a key and it's not present, skip it gracefully
    const needsKey = Object.values(api.params || {}).some(
      (v) => typeof v === 'string' && v.startsWith('${')
    );
    if (needsKey) {
      const missing = Object.values(api.params).some((v) => {
        if (typeof v !== 'string' || !v.startsWith('${')) return false;
        const key = v.slice(2, -1);
        return !process.env[key];
      });
      if (missing) continue;
    }

    try {
      const url = buildUrl(api, q);
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;

      const items = await normalize(api.key || api.name, api, r);
      for (const it of items) {
        if (
          whitelist.length &&
          !(it.domain || '').toLowerCase() || !whitelist.some((d) => (it.domain || '').toLowerCase().endsWith(d))
        ) {
          // domain not whitelisted
          if (whitelist.length) continue;
        }
        out.push(it);
      }
      if (out.length >= 8) break;
    } catch {
      // ignore this API if it fails; continue to next
    }
  }

  return dedupe(out).slice(0, 8);
}

// Convenience export to indicate whether persistence is active
export const hasKV = !!(KV_URL && KV_TOKEN);
