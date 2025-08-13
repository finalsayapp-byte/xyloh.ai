// /api/_sourcesUtil.js
// Shared helpers for KV history, config loading, and API responses.
// KV calls are "soft-fail" (never throw) so chat never breaks if KV is down.

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

function kvConfigured() {
  return Boolean(KV_URL && KV_TOKEN);
}

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

// History key: newest at head (LPUSH), trimmed to HIST_LIMIT
const HIST_LIMIT = 200;
const histKey = (userId) => `xyloh:history:${userId}`;

// ---- SAFE wrappers: never throw; chat must continue even if KV fails ----
export async function appendHistory(userId, role, content) {
  if (!kvConfigured()) return false;
  try {
    const item = JSON.stringify({ ts: Date.now(), role, content });
    await kvPOST(`lpush/${encodeURIComponent(histKey(userId))}`, { value: item });
    await kvPOST(
      `ltrim/${encodeURIComponent(histKey(userId))}/0/${HIST_LIMIT - 1}`
    );
    return true;
  } catch {
    return false;
  }
}

export async function readHistory(userId) {
  if (!kvConfigured()) return [];
  try {
    const res = await kvGET(
      `lrange/${encodeURIComponent(histKey(userId))}/0/${HIST_LIMIT - 1}`
    );
    const arr = Array.isArray(res?.result) ? res.result : [];
    return arr
      .map((s) => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean)
      .reverse(); // oldest -> newest
  } catch {
    return [];
  }
}

export async function clearHistory(userId) {
  if (!kvConfigured()) return false;
  try {
    await kvPOST(`del/${encodeURIComponent(histKey(userId))}`);
    return true;
  } catch {
    return false;
  }
}

// ---------- Load public JSON config safely ----------
export async function readPublicJson(fileRelative) {
  try {
    const filePath = path.join(process.cwd(), 'public', fileRelative);
    const buf = await fs.readFile(filePath);
    return JSON.parse(buf.toString('utf-8'));
  } catch {
    return null;
  }
}

// ---------- Response helpers ----------
export function ok(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).end(JSON.stringify(data));
}
export function bad(res, msg, code = 400) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(code).end(JSON.stringify({ error: msg }));
}

// ---------- Health helpers ----------
export async function kvPing() {
  if (!kvConfigured()) return { enabled: false };
  try {
    const key = `xyloh:p:${Math.random().toString(36).slice(2, 8)}`;
    await kvPOST(`set/${encodeURIComponent(key)}`, { value: '1', ex: 10 });
    const r = await kvGET(`get/${encodeURIComponent(key)}`);
    return { enabled: true, ok: r?.result === '1' };
  } catch (e) {
    return { enabled: true, ok: false, error: String(e?.message || e) };
  }
}
