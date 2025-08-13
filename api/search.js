import { fetchSources } from './_sourcesUtil.js';

export default async function handler(req, res){
  const { q, persona } = req.query || {};
  if(!q) return res.status(400).json({error:'Missing q'});
  try{
    const items = await fetchSources({ persona: persona || 'General', topic: q });
    res.status(200).json({ items });
  }catch(e){
    console.error('search error', e);
    res.status(500).json({error:'Search failed'});
  }
}
