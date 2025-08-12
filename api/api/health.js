export default async function handler(req, res) {
  const ok = !!process.env.OPENAI_API_KEY;
  return res.status(ok ? 200 : 500).json({ ok, haveOpenAI: ok });
}
