require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// Webhook Evolution API - recibe mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message?.conversation;
    const senderJid = body?.data?.key?.remoteJid; // ej: 34625186415@s.whatsapp.net
    const senderNumber = senderJid?.replace('@s.whatsapp.net', '');
    const senderName = body?.data?.pushName || 'Usuario';

    if (!message || !senderNumber) {
      console.warn('No se pudo extraer mensaje o número del webhook.');
      return res.status(400).json({ success: false, error: 'Faltan datos del mensaje o remitente' });
    }

    console.log(`📩 Mensaje recibido de ${senderName} (${senderNumber}): "${message}"`);

    // --- Paso 1: Enviar mensaje a Retell AI y obtener respuesta ---
    const retellResponse = await axios.post(
      'https://api.retell.ai/v1/message', // Ajusta URL según documentación Retell
      {
        phone: senderNumber,
        message: message,
        // sessionId: senderNumber, // Opcional para mantener contexto
        // otros parámetros según API Retell
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`
        }
      }
    );

    if (!retellResponse.data || !retellResponse.data.reply) {
      console.error('Respuesta inválida de Retell AI:', retellResponse.data);
      return res.status(500).json({ success: false, error: 'No se recibió respuesta válida de Retell' });
    }

    const replyText = retellResponse.data.reply;

    console.log(`🤖 Respuesta Retell AI para ${senderNumber}: "${replyText}"`);

    // --- Paso 2: Enviar respuesta a Evolution API para que envíe WhatsApp ---
    const evolutionResponse = await axios.post(
      `https://api.evoapicloud.com/message/sendText/${process.env.EVOLUTION_INSTANCE_ID}`,
      {
        number: senderNumber,
        text: replyText
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Mensaje enviado a ${senderNumber} vía Evolution API`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error en webhook:', error.response?.data || error.message || error);
    res.status(500).json({ success: false, error: error.message || 'Error interno' });
  }
});

// Health check básico
app.get('/', (req, res) => {
  res.send('🟢 Bot Evolution API + Retell AI activo');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});


