const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

export async function saveMessage(userId, role, content) {
  const history = await getHistory(userId);
  history.push({ role, content, timestamp: Date.now() });
  await fetch(`${kvUrl}/set/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(history)
  });
}

export async function getHistory(userId) {
  const resp = await fetch(`${kvUrl}/get/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${kvToken}` }
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data.result) ? data.result : [];
}
