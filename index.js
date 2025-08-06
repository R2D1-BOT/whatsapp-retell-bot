const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 10000;

// Webhook: Recibe mensajes de EvolutionAPI
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;

    if (event === 'message' && data.message_type === 'text') {
      const { phone, message } = data;

      console.log(`📩 WhatsApp: ${phone} → "${message}"`);

      // Enviar a Retell AI
      await axios.post(
        'https://api.retellai.com/v1/start-call',
        {
          agent_id: process.env.RETELL_AGENT_ID,
          custom_user_id: phone,
          meta: { message }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RETELL_API_KEY}`
          }
        }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false });
  }
});

// Callback de Retell
app.post('/retell-callback', (req, res) => {
  console.log('📞 Retell:', req.body);
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.send('🟢 Bot activo en Render');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
