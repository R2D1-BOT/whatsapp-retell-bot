require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const dns = require('dns');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// Configurar DNS público para Render
dns.setServers([
  '8.8.8.8',      // Google DNS primario
  '8.8.4.4',      // Google DNS secundario
  '1.1.1.1',      // Cloudflare DNS
]);

// IPs conocidas de Retell AI (fallback si DNS falla)
const RETELL_IPS = [
  '34.102.136.180',
  '35.244.181.51', 
  '34.118.254.236'
];

// Configuración especial para Render - bypass DNS
const httpsAgent = new https.Agent({
  family: 4, // Forzar IPv4
  timeout: 30000,
});

// Almacenar chat_ids por número de teléfono (en memoria)
const chatSessions = new Map();

// Función mejorada para hacer peticiones a Retell
async function callRetellAPI(endpoint, data) {
  const baseConfig = {
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

  // Intentar con dominio primero
  try {
    console.log(`🔄 Intentando conectar con: ${endpoint}`);
    return await axios.post(`https://api.retell.ai${endpoint}`, data, baseConfig);
  } catch (error) {
    
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      console.log('⚠️ DNS falla, intentando con IPs directas...');
      
      // Probar con cada IP conocida
      for (const ip of RETELL_IPS) {
        try {
          console.log(`🔄 Probando IP: ${ip}`);
          const response = await axios.post(`https://${ip}${endpoint}`, data, baseConfig);
          console.log(`✅ Conexión exitosa con IP: ${ip}`);
          return response;
        } catch (ipError) {
          console.log(`❌ IP ${ip} falló:`, ipError.message);
          continue;
        }
      }
      
      // Si todas las IPs fallan, intentar última vez con DNS público
      console.log('🔄 Último intento con DNS público...');
      try {
        const response = await new Promise((resolve, reject) => {
          dns.lookup('api.retell.ai', { family: 4 }, async (err, address) => {
            if (err) {
              reject(new Error('DNS lookup completamente fallido'));
              return;
            }
            
            try {
              console.log(`🔍 DNS resolvió a: ${address}`);
              const result = await axios.post(`https://${address}${endpoint}`, data, baseConfig);
              resolve(result);
            } catch (axiosError) {
              reject(axiosError);
            }
          });
        });
        
        return response;
      } catch (dnsError) {
        console.log('❌ DNS público también falló');
      }
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
      console.error('🚨 Error DNS persistente - Todas las IPs de Retell AI fallaron');
      console.error('💡 Verifica tu API key o prueba más tarde');
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

// Endpoint para probar conectividad DNS con todas las opciones
app.get('/test-dns', async (req, res) => {
  console.log('🧪 Iniciando test DNS completo...');
  
  const results = {
    domain: null,
    ips: {},
    dnsLookup: null
  };
  
  // Test 1: Dominio directo
  try {
    const response = await axios.get('https://api.retell.ai', {
      timeout: 5000,
      httpsAgent: httpsAgent
    });
    results.domain = { success: true, status: response.status };
  } catch (error) {
    results.domain = { success: false, error: error.message };
  }
  
  // Test 2: IPs directas
  for (const ip of RETELL_IPS) {
    try {
      const response = await axios.get(`https://${ip}`, {
        timeout: 5000,
        headers: { 'Host': 'api.retell.ai' },
        httpsAgent: httpsAgent
      });
      results.ips[ip] = { success: true, status: response.status };
    } catch (error) {
      results.ips[ip] = { success: false, error: error.message };
    }
  }
  
  // Test 3: DNS lookup
  try {
    const address = await new Promise((resolve, reject) => {
      dns.lookup('api.retell.ai', { family: 4 }, (err, addr) => {
        if (err) reject(err);
        else resolve(addr);
      });
    });
    results.dnsLookup = { success: true, address };
  } catch (error) {
    results.dnsLookup = { success: false, error: error.message };
  }
  
  console.log('🧪 Test DNS completo:', JSON.stringify(results, null, 2));
  res.json(results);
});

// Endpoint para probar la API de Retell específicamente
app.get('/test-retell', async (req, res) => {
  try {
    const response = await callRetellAPI('/v1/chat/create-chat', {
      agent_id: process.env.RETELL_AGENT_ID
    });
    res.json({ 
      success: true, 
      message: 'Retell API funciona correctamente',
      chat_id: response.data.chat_id
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.response?.data || error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔍 Para probar DNS: https://whatsapp-retell-bot.onrender.com/test-dns`);
  console.log(`🤖 Para probar Retell: https://whatsapp-retell-bot.onrender.com/test-retell`);
});
