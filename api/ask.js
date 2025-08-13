// Minimal OpenAI call via native fetch (no SDK).
export const config = { maxDuration: 30 };

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const { prompt, userId } = req.body || {};
  if(!prompt || !userId) return res.status(400).json({error:'Missing prompt or userId'});

  try{
    const messages = [{ role:'system', content:'You are Xyloh, concise and helpful.' }, { role:'user', content: prompt }];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7
      })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data?.error?.message || 'OpenAI error');

    const reply = data.choices?.[0]?.message?.content || '(no reply)';
    res.status(200).json({ reply });
  }catch(e){
    console.error('ask error', e);
    res.status(500).json({error: e.message || 'Failed'});
  }
}
