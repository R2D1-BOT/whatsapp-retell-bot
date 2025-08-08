import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// Variables de entorno necesarias
const PORT = process.env.PORT || 3000;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

// Webhook que recibe mensajes de Evolution API
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Mensaje entrante de Evolution API:", JSON.stringify(data));

    const message = data?.message?.text?.body || "";
    const from = data?.message?.from || "";

    if (!message || !from) {
      return res.sendStatus(200);
    }

    // 1️⃣ Enviar mensaje a Retell AI
    const retellResponse = await axios.post(
      `https://api.retellai.com/v1/chat/completion`,
      {
        agent_id: RETELL_AGENT_ID,
        messages: [{ role: "user", content: message }]
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply =
      retellResponse.data?.choices?.[0]?.message?.content ||
      "No tengo respuesta en este momento.";

    console.log("🤖 Respuesta de Retell:", reply);

    // 2️⃣ Enviar respuesta de vuelta a Evolution API (WhatsApp)
    await axios.post(
      "https://api.evolution-api.com/v1/messages",
      {
        to: from,
        type: "text",
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Bot WhatsApp-Retell activo");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
