const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 10000;

// Webhook: Recibe mensajes de Evolution API
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Webhook recibido:', JSON.stringify(req.body, null, 2));
    
    const { event, instance, data } = req.body;
    
    // Procesar mensajes entrantes
    if (event === 'MESSAGES_UPSERT' && data?.messages) {
      for (const msg of data.messages) {
        // Solo procesar mensajes de texto que no sean propios
        if (msg.messageType === 'textMessage' && !msg.key.fromMe) {
          const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
          const message = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
          
          if (message) {
            console.log(`📩 WhatsApp: ${phone} → "${message}"`);
            
            // Enviar a Retell AI
            try {
              await axios.post(
                'https://api.retellai.com/v1/start-call',
                {
                  agent_id: process.env.RETELL_AGENT_ID,
                  custom_user_id: phone,
                  meta: { message, whatsapp: true }
                },
                {
                  headers: {
                    Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              console.log(`✅ Mensaje enviado a Retell AI para ${phone}`);
            } catch (retellError) {
              console.error('❌ Error enviando a Retell:', retellError.response?.data || retellError.message);
            }
          }
        }
      }
    }
    
    // Log otros eventos importantes
    if (event === 'CONNECTION_UPDATE') {
      console.log(`🔌 Estado conexión: ${data.state}`);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error procesando webhook:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Callback de Retell
app.post('/retell-callback', (req, res) => {
  console.log('📞 Retell callback:', req.body);
  res.status(200).send('OK');
});

// Endpoint para enviar mensajes (opcional)
app.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    const response = await axios.post(
      `https://api.evoapicloud.com/message/sendText/${process.env.EVOLUTION_INSTANCE_ID}`,
      {
        number: phone,
        text: message
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Mensaje enviado a ${phone}: "${message}"`);
    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('🟢 WhatsApp Evolution API Bot activo en Render');
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    env: {
      retell_configured: !!process.env.RETELL_API_KEY,
      evolution_configured: !!process.env.EVOLUTION_TOKEN
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook URL: https://tu-app.onrender.com/webhook`);
});
