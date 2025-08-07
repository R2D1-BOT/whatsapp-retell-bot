require('dotenv').config();
const express = require('express');
const axios = require('axios');
const dns = require('dns');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// Almacenar chat_ids por número de teléfono (en memoria)
const chatSessions = new Map();

// SOLUCIÓN DNS: Configurar DNS público para Render
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Función auxiliar para hacer peticiones con retry DNS
async function retellApiCall(url, data) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
    },
    timeout: 30000,
    family: 4, // Forzar IPv4
  };

  // Intentar con diferentes configuraciones si falla
  try {
    return await axios.post(url, data, config);
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log('🔄 Reintentando con configuración DNS alternativa...');
      
      // Configuración alternativa
      config.headers['Host'] = 'api.retell.ai';
      config.httpAgent = null;
      config.httpsAgent = null;
      
      return await axios.post(url, data, config);
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
      
      const createChatResponse = await retellApiCall(
        'https://api.retell.ai/v1/chat/create-chat',
        { agent_id: process.env.RETELL_AGENT_ID }
      );

      chatId = createChatResponse.data.chat_id;
      chatSessions.set(senderNumber, chatId);
      console.log(`✅ Chat creado para ${senderNumber}: ${chatId}`);
    }

    // Enviar mensaje y obtener respuesta del agente
    console.log(`💬 Enviando mensaje a Retell AI chat ${chatId}`);
    
    const completionResponse = await retellApiCall(
      'https://api.retell.ai/v1/chat/create-chat-completion',
      {
        chat_id: chatId,
        message: message
      }
    );

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
    
    // Debugging específico mejorado
    if (error.code === 'ENOTFOUND') {
      console.error('🚨 Error DNS - Dominio no encontrado:', error.hostname);
      console.error('💡 Sugerencia: Contactar soporte de Render sobre resolución DNS');
    }
    if (error.response?.status === 401) {
      console.error('🚨 Error 401 - Verificar RETELL_API_KEY:', process.env.RETELL_API_KEY ? 'Existe' : 'NO EXISTE');
    }
    
    res.status(500).json({ success: false, error: error.message || 'Error interno' });
  }
});

// Endpoint para limpiar sesiones de chat (opcional)
app.post('/clear-sessions', (req, res) => {
  chatSessions.clear();
  console.log('🧹 Sesiones de chat limpiadas');
  res.json({ success: true, message: 'Sesiones limpiadas' });
});

// Health check
app.get('/', (req, res) => {
  res.send('🟢 Bot Evolution API + Retell AI Chat activo');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
