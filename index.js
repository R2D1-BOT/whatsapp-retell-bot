require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_ID = process.env.EVOLUTION_INSTANCE_ID;

const chatSessions = new Map();

async function createRetellChat(agentId) {
  const response = await axios.post(
    'https://api.retell.ai/create-chat',
    { agent_id: agentId },
    { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
  );
  return response.data.chat_id;
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message?.conversation;
    const senderJid = body?.data?.key?.remoteJid;
    const senderNumber = senderJid?.replace('@s.whatsapp.net', '');

    if (!message || !senderNumber)
      return res.status(400).json({ success: false, error: 'Faltan datos' });

    let chatId = chatSessions.get(senderNumber);
    if (!chatId) {
      chatId = await createRetellChat(RETELL_AGENT_ID);
      chatSessions.set(senderNumber, chatId);
    }

    const retellResp = await axios.post(
      'https://api.retell.ai/create-chat-completion',
      { chat_id: chatId, content: message },
      { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );

    const agentMsg = retellResp.data.messages.find(m => m.role === 'agent');
    if (!agentMsg)
      throw new Error('No hay respuesta del agente');

    await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_ID}`,
      { number: senderNumber, text: agentMsg.content },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error webhook:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});


