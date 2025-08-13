// /api/search.js
import { ok, bad } from './_sourcesUtil.js';

export const config = { maxDuration: 25 };

async function searchNYT(q) {
  const key = process.env.NYT_API_KEY;
  if (!key) return [];
  const url = new URL('https://api.nytimes.com/svc/search/v2/articlesearch.json');
  url.searchParams.set('q', q);
  url.searchParams.set('api-key', key);
  const r = await fetch(url, { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  const docs = data?.response?.docs || [];
  return docs.slice(0, 5).map((d) => ({
    title: d.headline?.main || 'NYT Article',
    url: d.web_url,
    source: 'NYT',
    publishedAt: d.pub_date
  }));
}

async function searchGuardian(q) {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return [];
  const url = new URL('https://content.guardianapis.com/search');
  url.searchParams.set('q', q);
  url.searchParams.set('api-key', key);
  url.searchParams.set('page-size', '5');
  const r = await fetch(url, { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  const results = data?.response?.results || [];
  return results.map((d) => ({
    title: d.webTitle,
    url: d.webUrl,
    source: 'Guardian',
    publishedAt: d.webPublicationDate
  }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return bad(res, 'Method not allowed', 405);
    const q = String(req.query?.q || '').trim();
    if (!q) return bad(res, 'Missing q', 400);

    const [nyt, gdn] = await Promise.all([searchNYT(q), searchGuardian(q)]);
    const items = [...nyt, ...gdn];

    return ok(res, { q, count: items.length, items });
  } catch (e) {
    return bad(res, e?.message || 'Failed', 500);
  }
}
