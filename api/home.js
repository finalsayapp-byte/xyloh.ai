export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Xyloh.ai — Home</title>
<link rel="stylesheet" href="/styles.css"/>
</head><body><div class="wrap">
<h1>Xyloh.ai</h1>
<p>The ultimate life ally. Choose a mode to begin.</p>
<div class="row" style="gap:14px;flex-wrap:wrap">
  <a class="btn" href="/awaken.html?mode=therapy">Therapist in Your Pocket</a>
  <a class="btn" href="/awaken.html?mode=negotiator">Life Negotiator</a>
  <a class="btn" href="/awaken.html?mode=translator">Medical & Legal Translator</a>
  <a class="btn" href="/awaken.html?mode=awakened">Communicate with the Other Side</a>
</div>
<p style="color:#a8a8b6;margin-top:14px">Tip: Visit <code>/api/health</code> to verify keys & KV.</p>
</div></body></html>`);
}
