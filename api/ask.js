import OpenAI from "openai";
import { saveMessage, getHistory } from "./_sourcesUtil.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, userId } = req.body;
  if (!prompt || !userId) {
    return res.status(400).json({ error: "Missing prompt or userId" });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const history = await getHistory(userId);
    const messages = [
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: prompt }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const aiMessage = completion.choices[0].message.content;
    await saveMessage(userId, "user", prompt);
    await saveMessage(userId, "assistant", aiMessage);

    res.status(200).json({ reply: aiMessage });
  } catch (err) {
    console.error("Error in ask.js:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
}
