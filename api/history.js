import { getHistory } from './_sourcesUtil.js';

export default async function handler(req, res){
  const { userId } = req.query || {};
  if(!userId) return res.status(400).json({error:'Missing userId'});

  try{
    const history = await getHistory(userId);
    res.status(200).json({ history });
  }catch(e){
    console.error('history error', e);
    res.status(500).json({error:'Failed to fetch history'});
  }
}
