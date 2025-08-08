require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

const chatSessions = new Map();

async function callRetellAPI(endpoint, data) {
  const url = `https://api.retell.ai${endpoint}`;
  const config = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
    },
    timeout: 30000,
  };

  try {
    console.log(`🔄 Conectando a Retell: ${endpoint}`);
    const response = await axios.post(url, data, config);
    return response;
  } catch (error) {
    throw new Error(`Error Retell API: ${error.message}`);
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message?.conversation;
    const senderJid = body?.data?.key?.remoteJid;
    const senderNumber = senderJid?.replace('@s.whatsapp.net', '');
    if (!message || !senderNumber) return res.status(400).json({ success: false, error: 'Faltan datos' });

    let chatId = chatSessions.get(senderNumber);

    if (!chatId) {
      const createChatResponse = await callRetellAPI('/v1/chat/create-chat', {
        agent_id: process.env.RETELL_AGENT_ID
      });
      chatId = createChatResponse.data.chat_id;
      chatSessions.set(senderNumber, chatId);
    }

    const completionResponse = await callRetellAPI('/v1/chat/create-chat-completion', {
      chat_id: chatId,
      content: message
    });

    const messages = completionResponse.data.messages;
    const agentMessage = messages.find(msg => msg.role === 'agent' || msg.role === 'assistant');
    if (!agentMessage) throw new Error('No hay respuesta del agente');

    const replyText = agentMessage.content;

    await axios.post(
      `${process.env.EVO_URL}/message/sendText/${process.env.EVO_ID}`,
      {
        number: senderNumber,
        text: replyText
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.EVO_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('🟢 Bot activo');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});



