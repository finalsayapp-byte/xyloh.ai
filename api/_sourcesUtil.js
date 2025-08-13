// /api/_sourcesUtil.js
// History + Profile (state) helpers using Upstash/Vercel KV REST (path-value style).
// Soft-fail: if KV is misconfigured/unavailable, chat still works (no hard crash).

import fs from 'fs/promises';
import path from 'path';

// ---------- KV (Upstash/Vercel KV REST) ----------
function normUrl(u){ return u ? String(u).replace(/\/+$/,'') : ''; }
const BASE = normUrl(
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  ''
);
const TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  '';

function kvConfigured(){ return Boolean(BASE && TOKEN); }

async function kvReq(cmdPath, { method='POST' } = {}) {
  const r = await fetch(`${BASE}/${cmdPath}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`KV error ${r.status}`);
  return r.json();
}

// Convenience wrappers for common commands (path-value style)
async function kvSet(key, value, { ex } = {}) {
  const exq = (typeof ex === 'number' && ex > 0) ? `?ex=${ex}` : '';
  return kvReq(`set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${exq}`);
}
async function kvGet(key) {
  return kvReq(`get/${encodeURIComponent(key)}`, { method:'GET' });
}
async function kvDel(key) {
  return kvReq(`del/${encodeURIComponent(key)}`);
}
async function kvLPush(key, value) {
  return kvReq(`lpush/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
}
async function kvLTrim(key, start, stop) {
  return kvReq(`ltrim/${encodeURIComponent(key)}/${start}/${stop}`);
}
async function kvLRange(key, start, stop) {
  return kvReq(`lrange/${encodeURIComponent(key)}/${start}/${stop}`, { method:'GET' });
}

// ---------- History (LIST newest->oldest) ----------
const HIST_LIMIT = 200;
const histKey = (userId) => `xyloh:history:${userId}`;

export async function appendHistory(userId, role, content) {
  if (!kvConfigured()) return false;
  try {
    const item = JSON.stringify({ ts: Date.now(), role, content });
    await kvLPush(histKey(userId), item);
    await kvLTrim(histKey(userId), 0, HIST_LIMIT - 1);
    return true;
  } catch { return false; }
}

export async function readHistory(userId) {
  if (!kvConfigured()) return [];
  try {
    const res = await kvLRange(histKey(userId), 0, HIST_LIMIT - 1);
    const arr = Array.isArray(res?.result) ? res.result : [];
    // Stored newest->oldest (LPUSH). We want oldest->newest.
    return arr.map(s => { try { return JSON.parse(s); } catch { return null; } })
              .filter(Boolean)
              .reverse();
  } catch { return []; }
}

export async function clearHistory(userId) {
  if (!kvConfigured()) return false;
  try { await kvDel(histKey(userId)); return true; }
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
    beliefNotes: [],      // user's framings
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
    const g = await kvGet(profileKey(userId));
    const raw = g?.result;
    if (!raw) return defaultProfile();
    const obj = JSON.parse(raw);
    return { ...defaultProfile(), ...obj };
  } catch { return defaultProfile(); }
}

export async function setProfile(userId, profile) {
  if (!kvConfigured()) return false;
  try {
    await kvSet(profileKey(userId), JSON.stringify(profile));
    return true;
  } catch { return false; }
}

export async function eraseAll(userId) {
  try { await clearHistory(userId); } catch {}
  try { if (kvConfigured()) await kvDel(profileKey(userId)); } catch {}
  return true;
}

// Stage gating by time since firstSeen (days) AND progress.
export function computeStage(profile) {
  const days = Math.max(0, (Date.now() - (profile.firstSeen || Date.now())) / 86400000);
  // Time caps: S1 >= 7d, S2 >= 21d, S3 >= 60d
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
  // Slow growth per interaction; time still gates
  const inc = 0.03; // ~33+ turns per stage
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

// ---------- Read public JSON safely ----------
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
    await kvSet(key, '1', { ex: 10 });
    const r = await kvGet(key);
    return { enabled:true, ok: r?.result === '1', raw:r };
  } catch (e) {
    return { enabled:true, ok:false, error:String(e?.message || e) };
  }
}
