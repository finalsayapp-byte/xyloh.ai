// /api/_sourcesUtil.js
// ─────────────────────────────────────────────────────────────────────────────
// Minimal persistence + trusted sources helper (Guardian + NYT).
// No external packages. Safe on Vercel serverless (ESM compiled to CJS by Vercel).

// ===== Upstash KV (REST) =====
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return data?.result ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key, val) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(val),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ===== Conversation History Helpers =====
// key shape: history:<userId>
// item shape: { role: 'user' | 'assistant' | 'system', content: string, ts: number }

const HISTORY_CAP = 200;

export async function getHistory(userId) {
  const key = `history:${userId}`;
  const arr = (await kvGet(key)) || [];
  return Array.isArray(arr) ? arr : [];
}

export async function saveHistory(userId, list) {
  const key = `history:${userId}`;
  const trimmed = Array.isArray(list) ? list.slice(-HISTORY_CAP) : [];
  return kvSet(key, trimmed);
}

export async function appendHistory(userId, role, content) {
  const h = await getHistory(userId);
  h.push({ role, content, ts: Date.now() });
  if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP);
  await saveHistory(userId, h);
  return h;
}

// Backwards-compat name used in earlier code:
export const saveMessage = appendHistory;

// ===== Trusted Sources (Guardian + NYT) =====
// Only queried if corresponding API keys are present in env.

const CONFIG = {
  guardian: {
    base: 'https://content.guardianapis.com/search',
    params: {
      'api-key': '${GUARDIAN_API_KEY}', // env placeholder
      'page-size': '10',
      'order-by': 'newest',
      'show-fields': 'headline,trailText,shortUrl',
    },
    map(json) {
      const items = json?.response?.results || [];
      return items.map((d) => ({
        title: d.webTitle,
        url: d.webUrl,
        domain: hostOf(d.webUrl),
        source: 'Guardian',
        published: d.webPublicationDate || null,
      }));
    },
  },
  nyt: {
    base: 'https://api.nytimes.com/svc/search/v2/articlesearch.json',
    params: {
      'api-key': '${NYT_API_KEY}', // env placeholder
      // Note: NYT expects 'q' in query string; we append it if not in params.
    },
    map(json) {
      const items = json?.response?.docs || [];
      return items.map((d) => ({
        title: d?.headline?.main || '',
        url: d?.web_url,
        domain: hostOf(d?.web_url),
        source: 'NYTimes',
        published: d?.pub_date || null,
      }));
    },
  },
};

function envSub(val) {
  // Replace ${ENV_NAME} with process.env.ENV_NAME at runtime.
  if (typeof val === 'string' && val.startsWith('${') && val.endsWith('}')) {
    const key = val.slice(2, -1);
    return process.env[key] || '';
  }
  return val;
}

function buildUrl(def, q) {
  const u = new URL(def.base);
  const params = def.params || {};
  for (const [k, v] of Object.entries(params)) {
    const s = envSub(v);
    if (s !== '') u.searchParams.set(k, s);
  }
  if (q && !('q' in params)) u.searchParams.set('q', q);
  return u.toString();
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
}

function apiIsUsable(def) {
  // If any param is an env placeholder and that env is missing, skip this API.
  const params = def.params || {};
  for (const v of Object.values(params)) {
    if (typeof v === 'string' && v.startsWith('${') && v.endsWith('}')) {
      const key = v.slice(2, -1);
      if (!process.env[key]) return false;
    }
  }
  return true;
}

/**
 * Fetch up to 8 citations across configured sources.
 * @param {Object} opts
 * @param {string} opts.topic - query topic
 * @returns {Promise<Array<{title:string,url:string,domain:string,source:string,published:string|null}>>}
 */
export async function fetchSources({ topic = '' } = {}) {
  const defs = [CONFIG.guardian, CONFIG.nyt].filter(Boolean).filter(apiIsUsable);
  const out = [];

  for (const def of defs) {
    try {
      const url = buildUrl(def, topic);
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      const json = await r.json().catch(() => null);
      if (!json) continue;
      const items = def.map(json) || [];
      for (const it of items) {
        if (it?.url && it?.title) out.push(it);
        if (out.length >= 8) break;
      }
      if (out.length >= 8) break;
    } catch {
      // swallow; continue other sources
    }
  }

  return out.slice(0, 8);
}

// Export a simple capability flag for health checks or UI hints.
export const hasKV = !!(KV_URL && KV_TOKEN);
