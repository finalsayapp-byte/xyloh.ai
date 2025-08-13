import { fetchSources } from './_sourcesUtil.js';

export default async function handler(req, res){
  const { q } = req.query || {};
  if(!q) return res.status(400).json({error:'Missing q'});
  try{
    const items = await fetchSources({ topic:q });
    res.status(200).json({ items });
  }catch(e){
    res.status(500).json({error:'Search failed'});
  }
}
