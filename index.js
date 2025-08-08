require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// Almacenar chat_ids por número de teléfono (en memoria)
const chatSessions = new Map();

// Función para hacer peticiones a Retell usando proxy
async function callRetellAPI(endpoint, data) {
  const url = `https://api.retell.ai${endpoint}`;
  const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
  
  const config = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 30000,
  };

  try {
    console.log(`🔄 Conectando vía proxy: ${endpoint}`);
    const response = await axios.post(proxyUrl, data, config);
    return response;
  } catch (error) {
    throw new Error(`Proxy falló: ${error.message}`);
  }
}

// Webhook Evolution API - recibe mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message?.conversation;
    const senderJid = body?.data?.key?.remoteJid;
    const senderNumber = senderJid?.replace('@s.whatsapp.net', '');
    const senderName = body?.data?.pushName || 'Usuario';

    if (!message || !senderNumber) {
      return res.status(400).json({ success: false, error: 'Faltan datos' });
    }

    console.log(`📩 Mensaje de ${senderName} (${senderNumber}): "${message}"`);

    let chatId = chatSessions.get(senderNumber);

    // Crear chat si no existe
    if (!chatId) {
      console.log(`🔄 Creando chat para ${senderNumber}`);
      
      const createChatResponse = await callRetellAPI('/v1/chat/create-chat', {
        agent_id: process.env.RETELL_AGENT_ID
      });

      chatId = createChatResponse.data.chat_id;
      chatSessions.set(senderNumber, chatId);
      console.log(`✅ Chat creado: ${chatId}`);
    }

    // Enviar mensaje a Retell
    console.log(`💬 Enviando a Retell chat ${chatId}`);
    
    const completionResponse = await callRetellAPI('/v1/chat/create-chat-completion', {
      chat_id: chatId,
      message: message
    });

    const messages = completionResponse.data.messages;
    const agentMessage = messages.find(msg => msg.role === 'assistant');
    
    if (!agentMessage) {
      throw new Error('No hay respuesta del agente');
    }

    const replyText = agentMessage.content;
    console.log(`🤖 Respuesta: "${replyText}"`);

    // Enviar respuesta via Evolution API
    await axios.post(
      `${process.env.Valor}/message/sendText/${process.env.EVOLUTION_INSTANCE_ID}`,
      {
        number: senderNumber,
        text: replyText
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Respuesta enviada a ${senderNumber}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('🟢 Bot activo con proxy');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
