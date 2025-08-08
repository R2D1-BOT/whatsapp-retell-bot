import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_CHAT_ID = process.env.RETELL_CHAT_ID;

app.post("/webhook", async (req, res) => {
  try {
    const messageFromUser = req.body.message?.text;
    const from = req.body.message?.from;

    if (!messageFromUser) return res.sendStatus(200);

    // 1. Enviar mensaje a Retell
    const retellResponse = await fetch("https://api.retellai.com/create-chat-completion", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: RETELL_CHAT_ID,
        content: messageFromUser
      })
    });

    const retellData = await retellResponse.json();
    const replyFromAgent = retellData?.messages?.[0]?.content || "No response from agent.";

    // 2. Enviar respuesta a Evolution para WhatsApp
    await fetch(`${EVOLUTION_API_URL}/message/sendText`, {
      method: "POST",
      headers: {
        "apikey": EVOLUTION_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatId: from,
        text: replyFromAgent
      })
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Error:", err);
    res.sendStatus(500);
  }
});

app.listen(8080, () => console.log("🚀 Servidor corriendo en puerto 8080"));

