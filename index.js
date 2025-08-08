// index.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

const EVO_URL = process.env.EVO_URL; // Ejemplo: https://api.evoapicloud.com
const EVO_TOKEN = process.env.EVO_TOKEN;
const EVO_ID = process.env.EVO_ID;

const chatSessions = new Map();

async function createRetellChat() {
  const response = await axios.post(
    'https://api.retell.ai/v1/chat/create-chat',
    { agent_id: RETELL_AGENT_ID },
    { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
  );
  return response.data.chat_id;
}

async function createRetellChatCompletion(chatId, content) {
  const response = await axios.post(
    'https://api.retell.ai/v1/chat/create-chat-completion',
    { chat_id: chatId, content },
    { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
  );
  return response.data.messages;
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message?.conversation;
    const senderJid = body?.data?.key?.remoteJid;
    if (!message || !senderJid) return res.status(400).json({ success: false, error: 'Faltan datos' });

    const senderNumber = senderJid.replace('@s.whatsapp.net', '');

    let chatId = chatSessions.get(senderNumber);
    if (!chatId) {
      chatId = await createRetellChat();
      chatSessions.set(senderNumber, chatId);
    }

    const messages = await createRetellChatCompletion(chatId, message);
    const agentMsg = messages.find(m => m.role === 'agent');
    if (!agentMsg) throw new Error('No hay respuesta del agente');

    // Enviar mensaje a Evolution API
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_ID}`,
      { number: senderNumber, text: agentMsg.content },
      { headers: { Authorization: `Bearer ${EVO_TOKEN}`, 'Content-Type': 'application/json' } }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => res.send('🟢 Bot activo'));

app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));


