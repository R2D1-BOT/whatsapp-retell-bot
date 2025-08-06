const express = require('express');
const axios = require('axios');
require('dotenv').config();
const app = express();
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 10000;

// Webhook: Recibe mensajes de Evolution API
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Webhook recibido - Headers:', req.headers);
    console.log('📨 Webhook recibido - Body:', req.body);
    console.log('📨 Webhook recibido - Raw body type:', typeof req.body);
    console.log('📨 Webhook recibido - Body stringified:', JSON.stringify(req.body, null, 2));
    
    // Responder OK sin importar qué llegue
    res.status(200).json({ success: true, message: 'Webhook recibido correctamente' });
    
  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
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
  console.log(`📱 Webhook URL: https://whatsapp-retell-bot.onrender.com/webhook`);
});
