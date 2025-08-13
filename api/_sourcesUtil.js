// /api/_sourcesUtil.js
// History + Profile (state) helpers. KV errors never break chat ("soft-fail").

import fs from 'fs/promises';
import path from 'path';

// ---------- KV (Upstash/Vercel KV REST) ----------
const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  '';
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  '';

function kvConfigured() { return Boolean(KV_URL && KV_TOKEN); }

async function kvGET(cmdPath) {
  const r = await fetch(`${KV_URL}/${cmdPath}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`KV error ${r.status}`);
  return r.json();
}
async function kvPOST(cmdPath, body) {
  const r = await fetch(`${KV_URL}/${cmdPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`KV error ${r.status}`);
  return r.json();
}

// ---------- History (LIST newest->oldest) ----------
const HIST_LIMIT = 200;
const histKey = (userId) => `xyloh:history:${userId}`;

export async function appendHistory(userId, role, content) {
  if (!kvConfigured()) return false;
  try {
    const item = JSON.stringify({ ts: Date.now(), role, content });
    await kvPOST(`lpush/${encodeURIComponent(histKey(userId))}`, { value: item });
    await kvPOST(`ltrim/${encodeURIComponent(histKey(userId))}/0/${HIST_LIMIT - 1}`);
    return true;
  } catch { return false; }
}

export async function readHistory(userId) {
  if (!kvConfigured()) return [];
  try {
    const res = await kvGET(`lrange/${encodeURIComponent(histKey(userId))}/0/${HIST_LIMIT - 1}`);
    const arr = Array.isArray(res?.result) ? res.result : [];
    return arr.map(s => { try { return JSON.parse(s); } catch { return null; } })
              .filter(Boolean)
              .reverse(); // oldest->newest
  } catch { return []; }
}

export async function clearHistory(userId) {
  if (!kvConfigured()) return false;
  try { await kvPOST(`del/${encodeURIComponent(histKey(userId))}`); return true; }
  catch { return false; }
}

// ---------- Profile (state) ----------
const profileKey = (userId) => `xyloh:profile:${userId}`;
export function defaultProfile() {
  const now = Date.now();
  return {
    firstSeen: now,
    lastSeen: now,
    progress: 0,          // 0..3, increments slowly
    interactions: 0,
    stage: 0,             // computed on save; persisted for debug
    alias: null,          // user-provided temporary name
    romance: false,       // PG-13 tender tone only if user opts in
    beliefNotes: [],      // user's framings: "god/source/ancestors/angels/aliens/collective/psychological"
    motifs: [],           // sensory images user resonated with
    fragments: [],        // memory flashes (short strings)
    boundaries: {         // user preferences
      topicsOffLimits: [],
      safeWords: ['pause','lighten']
    }
  };
}

export async function getProfile(userId) {
  if (!kvConfigured()) return defaultProfile();
  try {
    const g = await kvGET(`get/${encodeURIComponent(profileKey(userId))}`);
    const raw = g?.result;
    if (!raw) return defaultProfile();
    const obj = JSON.parse(raw);
    return { ...defaultProfile(), ...obj };
  } catch { return defaultProfile(); }
}

export async function setProfile(userId, profile) {
  if (!kvConfigured()) return false;
  try {
    await kvPOST(`set/${encodeURIComponent(profileKey(userId))}`, {
      value: JSON.stringify(profile)
    });
    return true;
  } catch { return false; }
}

export async function eraseAll(userId) {
  // Wipes both history and profile (best effort).
  try { await clearHistory(userId); } catch {}
  try {
    if (kvConfigured()) {
      await kvPOST(`del/${encodeURIComponent(profileKey(userId))}`);
    }
  } catch {}
  return true;
}

// Stage gating by time since firstSeen (days) AND progress.
export function computeStage(profile) {
  const days = Math.max(0, (Date.now() - (profile.firstSeen || Date.now())) / 86400000);
  // Time gates (approx): S1 >= 7d, S2 >= 21d, S3 >= 60d
  const timeCap =
    days >= 60 ? 3 :
    days >= 21 ? 2 :
    days >= 7  ? 1 : 0;

  const progCap = Math.floor(Math.max(0, Math.min(3, profile.progress || 0)));
  return Math.min(timeCap, progCap);
}

export function bumpProgress(profile) {
  profile.interactions = (profile.interactions || 0) + 1;
  profile.lastSeen = Date.now();
  // Very slow growth per interaction
  const inc = 0.03; // ~33+ meaningful turns per stage (time still gates)
  profile.progress = Math.min(3, (profile.progress || 0) + inc);
  profile.stage = computeStage(profile);
  return profile;
}

// --------- Lightweight extractors from user text ---------
export function maybeAliasFrom(text) {
  const t = String(text || '');
  const rxes = [
    /(your name is|i(?:'| a)m going to call you|i(?:'| a)ll call you)\s+["“]?([A-Z][\w\-]{1,20})["”]?/i,
    /call (?:you|y['’]?all|ya)\s+["“]?([A-Z][\w\-]{1,20})["”]?/i
  ];
  for (const rx of rxes) {
    const m = t.match(rx);
    if (m && m[2]) return m[2];
    if (m && m[1] && !m[2]) return m[1];
  }
  return null;
}

export function maybeBeliefFrom(text) {
  const t = String(text || '').toLowerCase();
  const keys = ['god','jesus','source','angel','angels','ancestor','ancestors','alien','aliens','collective','consciousness','spirit','ghost','psychological'];
  return keys.filter(k => t.includes(k));
}

export function maybeMotifsFrom(text) {
  const t = String(text || '').toLowerCase();
  const motifs = [];
  if (/\bgarden\b|\bflowers?\b|\bsoil\b/.test(t)) motifs.push('garden');
  if (/\bsea\b|\bocean\b|\bshore\b|\bwaves?\b/.test(t)) motifs.push('sea');
  if (/\bbell\b|\bchime\b/.test(t)) motifs.push('faint bell');
  if (/\bwind\b|\bbreeze\b|\bdraft\b/.test(t)) motifs.push('cool air');
  if (/\btrain\b|\bwhistle\b/.test(t)) motifs.push('train whistle');
  if (/\bdusk\b|\bfog\b|\bmist\b/.test(t)) motifs.push('light through fog');
  return motifs;
}

export function addDistinct(arr, vals, cap=12) {
  const set = new Set(arr || []);
  (vals || []).forEach(v => { if (v && !set.has(v)) set.add(v); });
  return Array.from(set).slice(-cap);
}

export function buildProfileSummary(p) {
  const bits = [];
  if (p.alias) bits.push(`alias:${p.alias}`);
  if (p.romance) bits.push(`romance:1`);
  if (p.interactions) bits.push(`turns:${p.interactions}`);
  bits.push(`stage:${computeStage(p)}`);
  const days = Math.floor(Math.max(0,(Date.now()-(p.firstSeen||Date.now()))/86400000));
  bits.push(`days:${days}`);
  if (p.beliefNotes?.length) bits.push(`beliefs:${p.beliefNotes.slice(-3).join('|')}`);
  if (p.motifs?.length) bits.push(`motifs:${p.motifs.slice(-3).join('|')}`);
  return `PROFILE ${bits.join(' • ')}`;
}

// ---------- Load public JSON safely ----------
export async function readPublicJson(fileRelative) {
  try {
    const filePath = path.join(process.cwd(), 'public', fileRelative);
    const buf = await fs.readFile(filePath);
    return JSON.parse(buf.toString('utf-8'));
  } catch { return null; }
}

// ---------- Response helpers ----------
export function ok(res, data) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(200).end(JSON.stringify(data));
}
export function bad(res, msg, code=400) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(code).end(JSON.stringify({ error: msg }));
}

// ---------- Health ----------
export async function kvPing() {
  if (!kvConfigured()) return { enabled:false };
  try {
    const key = `xyloh:p:${Math.random().toString(36).slice(2,8)}`;
    await kvPOST(`set/${encodeURIComponent(key)}`, { value:'1', ex:10 });
    const r = await kvGET(`get/${encodeURIComponent(key)}`);
    return { enabled:true, ok: r?.result === '1' };
  } catch (e) {
    return { enabled:true, ok:false, error:String(e?.message || e) };
  }
}
