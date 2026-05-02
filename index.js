const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE LUMIN ---
// Este es tu token permanente. Asegúrate de que no tenga espacios al final.
const TOKEN = process.env.WHATSAPP_TOKEN;
const ID_TELEFONO = process.env.PHONE_NUMBER_ID; 
const TOKEN_VERIFICACION = process.env.VERIFY_TOKEN; 

// --- CONFIGURACIÓN DE GEMINI AI ---
// Verificación de seguridad para la API Key
if (!process.env.GEMINI_API_KEY) {
    console.error("⚠️  ALERTA: La variable GEMINI_API_KEY no está configurada.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Ajustamos el nombre del modelo a la versión más estable compatible con v1beta
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
    systemInstruction: "Eres el asistente virtual de LUMIN, un proyecto de ITCA-Fepade de El Salvador. LUMIN se especializa en control inteligente de iluminación y bombas de agua. El equipo está conformado por: Walter Menjívar (CEO), Oscar, Antonio, Jordan y Everth. Responde siempre de forma amable, técnica y concisa. Si no conoces una respuesta técnica específica sobre el hardware, invita al usuario a esperar la atención de un experto."
});

// --- FUNCIÓN PARA OBTENER RESPUESTA DE LA IA ---
async function obtenerRespuestaIA(mensajeUsuario) {
    try {
        const result = await model.generateContent(mensajeUsuario);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("❌ Error en Gemini AI:", error.message);
        return "Lo siento, estoy teniendo problemas para procesar tu solicitud. Por favor, intenta de nuevo más tarde.";
    }
}

// --- FUNCIÓN DE ENVÍO DE MENSAJES ---
async function enviarMensajeWhatsApp(numero, textoRespuesta) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${ID_TELEFONO}/messages`, {
            messaging_product: "whatsapp",
            to: numero,
            type: "text",
            text: { body: textoRespuesta }
        }, {
            headers: { 
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log("✅ Respuesta enviada con éxito a:", numero);
    } catch (error) {
        // Mejoramos la visualización del error para saber exactamente qué falla
        console.error("❌ Error de Meta:", error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

// --- 1. VERIFICACIÓN DEL WEBHOOK ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === TOKEN_VERIFICACION) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// --- 2. RECEPCIÓN DE MENSAJES ---
app.post('/webhook', async (req, res) => {
    const body = req.body;
    
    // Enviamos el 200 inmediatamente para evitar reintentos de Meta
    res.sendStatus(200);

    // IMPORTANTE: Meta envía notificaciones de "leído" y "entregado" que no tienen mensajes.
    // Añadimos esta validación para que el bot no se trabe.
    if (body.object) {
        if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const message = body.entry[0].changes[0].value.messages[0];
            const numeroCliente = message.from;

            // Verificamos que sea un mensaje de texto
            if (message.type === 'text') {
                const mensajeRecibido = message.text.body.toLowerCase().trim();
                console.log(`📩 Mensaje de ${numeroCliente}: ${mensajeRecibido}`);

                // Obtenemos la respuesta dinámica de la IA
                const textoRespuesta = await obtenerRespuestaIA(mensajeRecibido);

                await enviarMensajeWhatsApp(numeroCliente, textoRespuesta);
            }
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de LUMIN listo en puerto ${PORT}`);
});