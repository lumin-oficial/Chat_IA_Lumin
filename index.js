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
// Usamos la configuración estándar para evitar errores de versión 404/400
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY?.trim());
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- FUNCIÓN PARA OBTENER RESPUESTA DE LA IA ---
async function obtenerRespuestaIA(mensajeUsuario) {
    try {
        // Inyectamos la personalidad directamente en el mensaje (Prompt Injection).
        // Esta es la forma más estable y moderna de asegurar que la IA no pierda su identidad
        // sin causar errores de compatibilidad con los servidores de Google.
        const instruccionesSistema = `Eres el asistente virtual de LUMIN, un proyecto de ITCA-Fepade de El Salvador. 
        Te especializas en control inteligente de iluminación y bombas de agua. 
        El equipo técnico es: Walter Menjívar (CEO), Oscar, Antonio, Jordan y Everth. 
        Responde de forma amable, técnica y concisa. Si no sabes algo, pide esperar a un experto. 
        No menciones que eres una IA.`;

        const promptFinal = `${instruccionesSistema}\n\nUsuario pregunta: ${mensajeUsuario}`;

        const result = await model.generateContent(promptFinal);
        const response = result.response;
        return response.text();
    } catch (error) {
        const errorMsg = error.message || String(error);
        const statusCode = error.status || (error.response ? error.response.status : null);

        console.error("❌ Error en Gemini AI:", errorMsg);

        if (statusCode === 429) return "Límite de mensajes alcanzado. Intenta en un minuto.";
        if (statusCode === 404) return "Error de configuración de IA (404). Verifica la API Key.";

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