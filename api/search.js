import fetch from "node-fetch";

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  try {
    // Example search using Guardian API if present
    if (process.env.GUARDIAN_API_KEY) {
      const resp = await fetch(`https://content.guardianapis.com/search?q=${encodeURIComponent(q)}&api-key=${process.env.GUARDIAN_API_KEY}`);
      const data = await resp.json();
      return res.status(200).json(data);
    }

    return res.status(200).json({ message: "Search APIs not configured" });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}
