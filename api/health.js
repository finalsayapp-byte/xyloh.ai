export default async function handler(req, res) {
  const response = {
    ok: !!process.env.OPENAI_API_KEY,
    kv: !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
    env: Object.keys(process.env)
  };
  res.status(200).json(response);
}
