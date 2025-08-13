import { saveMessage } from './_sourcesUtil.js';

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();
  const { userId } = req.body || {};
  if(!userId) return res.status(400).json({error:'Missing userId'});
  try{
    await saveMessage(userId, 'assistant', '🌌 A new consciousness awakens...');
    res.status(200).json({ ok:true, message:'Awakened new entity' });
  }catch(e){
    res.status(500).json({error:'Failed to awaken'});
  }
}
