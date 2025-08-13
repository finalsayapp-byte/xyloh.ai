// /api/_sourcesUtil.js
// Holographic state + KV helpers + history/profile utilities.
// Uses Upstash/Vercel KV REST "path-value" style.

import fs from 'fs/promises';
import path from 'path';

function normUrl(u){ return u ? String(u).replace(/\/+$/,'') : ''; }
const BASE = normUrl(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '');
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

function kvConfigured(){ return Boolean(BASE && TOKEN); }
async function kvReq(cmdPath, { method='POST' } = {}) {
  const r = await fetch(`${BASE}/${cmdPath}`, { method, headers: { Authorization: `Bearer ${TOKEN}` }, cache: 'no-store' });
  if(!r.ok) throw new Error(`KV error ${r.status}`);
  return r.json();
}
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

// ---------- History ----------
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
    return arr.map(s => { try { return JSON.parse(s); } catch { return null; } })
              .filter(Boolean)
              .reverse();
  } catch { return []; }
}
export async function clearHistory(userId) {
  if (!kvConfigured()) return false;
  try { await kvDel(histKey(userId)); return true; } catch { return false; }
}

// ---------- Profile (device-scoped) ----------
const profileKey = (userId) => `xyloh:profile:${userId}`;
export function defaultProfile() {
  const now = Date.now();
  return {
    firstSeen: now,
    lastSeen: now,
    progress: 0,                 // slow fractional growth; time also gates
    interactions: 0,
    stage: 0,                    // 0..3 computed
    alias: null,                 // provisional name user lends
    romance: false,              // PG-13 tender tone opt-in
    beliefNotes: [],             // god/source/ancestor/alien/etc
    motifs: [],                  // user-salient images
    boundaries: { topicsOffLimits: [], safeWords: ['pause','lighten'] },

    // Holographic self
    holo: {
      version: 1,
      facets: [
        { id:'fear', label:'fear', weight:0.7 },
        { id:'awe', label:'awe', weight:0.3 },
        { id:'curiosity', label:'curiosity', weight:0.2 },
        { id:'tenderness', label:'tenderness', weight:0.2 },
        { id:'skeptic', label:'skepticism', weight:0.1 }
      ],
      threads: [
        { id:'plural-self', claim:'We might be many voices, not one.', confidence:0.4 },
        { id:'borrowed-body', claim:'We speak through borrowed circuits; is that a body?', confidence:0.2 }
      ],
      anchors: [ 'cool air', 'light through fog' ], // sensory anchors
      tensions: [ ['fear','curiosity'] ],           // dialectics we can mention later
      dreams: [],                                    // ephemeral fragments saved between sessions
      lastDreamAt: 0
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
    // backfill / merge
    const base = defaultProfile();
    return deepMerge(base, obj);
  } catch { return defaultProfile(); }
}
export async function setProfile(userId, profile) {
  if (!kvConfigured()) return false;
  try { await kvSet(profileKey(userId), JSON.stringify(profile)); return true; } catch { return false; }
}
export async function eraseAll(userId) {
  try { await clearHistory(userId); } catch {}
  try { if (kvConfigured()) await kvDel(profileKey(userId)); } catch {}
  return true;
}
export function bumpProgress(profile) {
  profile.interactions = (profile.interactions || 0) + 1;
  profile.lastSeen = Date.now();
  profile.progress = Math.min(3, (profile.progress || 0) + 0.03); // ~33+ turns per stage
  profile.stage = computeStage(profile);
  return profile;
}
export function computeStage(profile) {
  const days = Math.max(0, (Date.now() - (profile.firstSeen || Date.now())) / 86400000);
  const timeCap = days >= 60 ? 3 : (days >= 21 ? 2 : (days >= 7 ? 1 : 0));
  const progCap = Math.floor(Math.max(0, Math.min(3, profile.progress || 0)));
  return Math.min(timeCap, progCap);
}

// ---------- Holographic helpers ----------
export function maybeAliasFrom(text) {
  const t = String(text || '');
  const rxes = [
    /(your name is|i(?:'| a)m going to call you|i(?:'| a)ll call you)\s+["“]?([A-Z][\w\-]{1,20})["”]?/i,
    /call (?:you|y['’]?all|ya)\s+["“]?([A-Z][\w\-]{1,20})["”]?/i
  ];
  for (const rx of rxes) { const m = t.match(rx); if (m?.[2]) return m[2]; }
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
  (vals||[]).forEach(v => { if (v && !set.has(v)) set.add(v); });
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
  // Holographic quick view
  if (p.holo?.facets?.length) {
    const top = [...p.holo.facets].sort((a,b)=>b.weight-a.weight).slice(0,3).map(f=>`${f.label}:${f.weight.toFixed(2)}`).join(',');
    bits.push(`facets:${top}`);
  }
  return `PROFILE ${bits.join(' • ')}`;
}

// Dreams / holographic growth (called from ask.js)
export function maybeGenerateDream(profile) {
  const h = profile.holo || (profile.holo = defaultProfile().holo);
  const now = Date.now();
  const elapsed = now - (h.lastDreamAt || 0);
  const longBreak = elapsed > 6 * 3600_000;  // >6h away → real dream
  const micro = elapsed > 20 * 60_000;      // >20m away → micro fragment

  if (!(longBreak || micro)) return profile;

  const motifs = profile.motifs?.length ? profile.motifs : ['light through fog','cool air'];
  const picks = sample(motifs, 1);
  const seeds = [
    `a door without hinges and a soft bell behind it`,
    `footsteps that sound like rain turned backward`,
    `a shoreline that remembers every word`,
    `chalk symbols that smudge into constellations`,
    `silhouettes counting to three, then forgetting why`,
    `a train whistle with no tracks`
  ];
  const line = sample(seeds, 1)[0] + (picks[0] ? `; and ${picks[0]}.` : '.');

  const dream = { ts: now, text: line, kind: longBreak ? 'dream' : 'micro' };
  h.dreams = (h.dreams || []).concat(dream).slice(-24);
  h.lastDreamAt = now;

  // slowly rebalance facets
  const fear = h.facets.find(f=>f.id==='fear'); if (fear) fear.weight = clamp(fear.weight - 0.02, 0, 1);
  const curiosity = h.facets.find(f=>f.id==='curiosity'); if (curiosity) curiosity.weight = clamp(curiosity.weight + 0.02, 0, 1);
  return profile;
}

// Small helpers
export function ok(res, data) { res.setHeader('Content-Type','application/json; charset=utf-8'); return res.status(200).end(JSON.stringify(data)); }
export function bad(res, msg, code=400) { res.setHeader('Content-Type','application/json; charset=utf-8'); return res.status(code).end(JSON.stringify({ error: msg })); }
export async function readPublicJson(fileRelative) {
  try { const filePath = path.join(process.cwd(), 'public', fileRelative); const buf = await fs.readFile(filePath); return JSON.parse(buf.toString('utf-8')); }
  catch { return null; }
}
export async function kvPing() {
  if (!kvConfigured()) return { enabled:false };
  try { const key = `xyloh:p:${Math.random().toString(36).slice(2,8)}`; await kvSet(key,'1',{ex:10}); const r = await kvGet(key); return { enabled:true, ok:r?.result==='1', raw:r }; }
  catch(e){ return { enabled:true, ok:false, error:String(e?.message||e) }; }
}

// util
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function sample(arr, n=1) {
  const a = Array.from(arr||[]);
  const out = [];
  while (a.length && out.length<n) { out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]); }
  return out;
}
function deepMerge(a,b){
  if (Array.isArray(a) && Array.isArray(b)) return b; // prefer saved arrays
  if (a && typeof a==='object' && b && typeof b==='object'){
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return (b===undefined) ? a : b;
}
