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

    // 🔍 Extraer datos del mensaje recibido
    const message = req.body?.data?.message?.conversation;
    const senderNumber = req.body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const senderName = req.body?.data?.pushName || '👤';

    if (message && senderNumber) {
      console.log(`💬 Mensaje recibido de ${senderName} (${senderNumber}): "${message}"`);

      // 📨 Enviar respuesta de vuelta vía Evolution API
      await axios.post(
        `https://api.evoapicloud.com/message/sendText/${process.env.EVOLUTION_INSTANCE_ID}`,
        {
          number: senderNumber,
          text: `👋 Hola ${senderName}, has dicho: "${message}". ¿Cómo puedo ayudarte?`
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.EVOLUTION_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Respuesta enviada a ${senderNumber}`);
    } else {
      console.warn('⚠️ No se pudo ext

