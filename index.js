require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Webhook de Evolution API
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body?.data?.message?.conversation;
    const senderNumber = req.body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const senderName = req.body?.data?.pushName || 'Usuario';

    if (message && senderNumber) {
      console.log(`📩 Mensaje recibido de ${senderName} (${senderNumber}): "${message}"`);

      // Respuesta automática (puedes conectarlo con Retell o tu lógica aquí)
      const evoResponse = await axios.post(
        `https://api.evoapicloud.com/message/sendText/${process.env.EVOLUTION_INSTANCE_ID}`,
        {
          number: senderNumber,
          text: `Hola ${senderName}, has dicho: "${message}". ¿Cómo puedo ayudarte?`
        },
        {
          headers: {
            'apikey': process.env.EVOLUTION_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Respuesta enviada a ${senderNumber}: status ${evoResponse.status}`);
    } else {
      console.warn('⚠️ No se pudo extraer mensaje o número del webhook.');
    }

    res.status(200).send('ok');
  } catch (error) {
    console.error('❌ Error procesando el webhook:', error?.response?.data || error.message);
    res.status(500).send('error');
  }
});

app.get('/', (req, res) => {
  res.send('Webhook activo ✔️');
});

app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${port}`);
});


