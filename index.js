require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// Configuración especial para Render - bypass DNS
const httpsAgent = new https.Agent({
  family: 4, // Forzar IPv4
  timeout: 30000,
});

// Almacenar chat_ids por número de teléfono (en memoria)
const chatSessions = new Map();

// Función para hacer peticiones a Retell con configuración especial
async function callRetellAPI(endpoint, data) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
      'Host': 'api.retell.ai',
      'User-Agent': 'Node.js/Render-App'
    },
    httpsAgent: httpsAgent,
    timeout: 30000,
    maxRedirects: 5,
  };

  try {
    console.log(`🔄 Intentando conectar con: ${endpoint}`);
    return await axios.post(`https://api.retell.ai${endpoint}`, data, config);
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log('⚠️ DNS falla, intentando con servidor DNS público...');
      
      // Configuración alternativa con DNS público
      const alternativeConfig = {
        ...config,
        headers: {
          ...config.headers,
          'Accept': 'application/json',
          'Connection': 'keep-alive'
        },
        family: 4,
        lookup: require('dns').lookup
      };
      
      return await axios.post(`https://api.retell.ai${endpoint}`, data, alternativeConfig);
    }
    throw error;
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
      console.warn('No se pudo extraer mensaje o número del webhook.');
      return res.status(400).json({ success: false, error: 'Faltan datos del mensaje o remitente' });
    }

    console.log(`📩 Mensaje recibido de ${senderName} (${senderNumber}): "${message}"`);

    let chatId = chatSessions.get(senderNumber);

    // Si no existe chat para este número, crear uno nuevo
    if (!chatId) {
      console.log(`🔄 Creando nueva sesión de chat para ${senderNumber}`);
      
      const createChatResponse = await callRetellAPI('/v1/chat/create-chat', {
        agent_id: process.env.RETELL_AGENT_ID
      });

      chatId = createChatResponse.data.chat_id;
      chatSessions.set(senderNumber, chatId);
      console.log(`✅ Chat creado para ${senderNumber}: ${chatId}`);
    }

    // Enviar mensaje y obtener respuesta del agente
    console.log(`💬 Enviando mensaje a Retell AI chat ${chatId}`);
    
    const completionResponse = await callRetellAPI('/v1/chat/create-chat-completion', {
      chat_id: chatId,
      message: message
    });

    // Extraer la respuesta del agente
    const messages = completionResponse.data.messages;
    const agentMessage = messages.find(msg => msg.role === 'assistant');
    
    if (!agentMessage) {
      console.error('No se encontró respuesta del agente en:', messages);
      return res.status(500).json({ success: false, error: 'No se recibió respuesta del agente' });
    }

    const replyText = agentMessage.content;
    console.log(`🤖 Respuesta Retell AI para ${senderNumber}: "${replyText}"`);

    // Enviar respuesta via Evolution API
    const evolutionResponse = await axios.post(
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

    console.log(`✅ Respuesta enviada a ${senderNumber}: status ${evolutionResponse.status}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Error en webhook:', error.response?.data || error.message || error);
    
    if (error.code === 'ENOTFOUND') {
      console.error('🚨 Error DNS persistente - Render no puede resolver api.retell.ai');
      console.error('💡 Contacta soporte de Render o considera usar proxy/VPN');
    }
    if (error.response?.status === 401) {
      console.error('🚨 Error 401 - Verificar RETELL_API_KEY');
    }
    
    res.status(500).json({ success: false, error: error.message || 'Error interno' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('🟢 Bot Evolution API + Retell AI Chat activo');
});

// Endpoint para probar conectividad DNS
app.get('/test-dns', async (req, res) => {
  try {
    const response = await callRetellAPI('/v1/chat/create-chat', {
      agent_id: process.env.RETELL_AGENT_ID
    });
    res.json({ success: true, message: 'DNS funciona correctamente' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔍 Para probar DNS: https://whatsapp-retell-bot.onrender.com/test-dns`);
});
