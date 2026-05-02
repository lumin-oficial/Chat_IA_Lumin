const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

// --- CONFIGURACIÓN DE LUMIN ---
// Este es tu token permanente. Asegúrate de que no tenga espacios al final.
const TOKEN = process.env.WHATSAPP_TOKEN || "EAA3Gj9BhHTQBRROm00XhsmyzpQf6F8fKm5k5fdff96SxYLFN04KFI1b3Ekyh8fMNm3BlGFgv7rukyNQakmhDHifbi0Y1nBu0ZBZB5T0ZCZA0gtTPoOlMhTztWEXfWPsYcD64zbguJKIKzbcDC3NACyIBtov3Em6ZBjh012xx1f9Hieu8A1xoZCoouuhNkKCXJqlu19ZCKdR2TOxflLwsz0X5pZA5Q1Xuq00hhwr2KkBxJOKLMS62HKFZC4yyPQ2Glcd36KVoDBgLy8hyxeezUaEI1";
const ID_TELEFONO = process.env.PHONE_NUMBER_ID || "1134073349784201"; 
const TOKEN_VERIFICACION = process.env.VERIFY_TOKEN || "LUMIN_2026"; 

// --- CONFIGURACIÓN DE GEMINI AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "TU_API_KEY_AQUÍ");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- FUNCIÓN PARA OBTENER RESPUESTA DE LA IA ---
async function obtenerRespuestaIA(mensajeUsuario) {
    try {
        const prompt = `Eres el asistente virtual de LUMIN, un proyecto de ITCA-Fepade. 
        LUMIN se especializa en control de iluminación y bombas de agua. 
        El equipo es: Walter Menjívar (CEO), Oscar, Antonio, Jordan y Everth.
        Responde de forma amable, concisa y técnica a esto: ${mensajeUsuario}`;

        const result = await model.generateContent(prompt);
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
    
    // IMPORTANTE: Meta envía notificaciones de "leído" y "entregado" que no tienen mensajes.
    // Añadimos esta validación para que el bot no se trabe.
    if (body.object) {
        if (body.entry && 
            body.entry[0].changes && 
            body.entry[0].changes[0].value.messages && 
            body.entry[0].changes[0].value.messages[0]) {
            
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
        res.sendStatus(200); // Siempre responder 200 a Meta
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de LUMIN listo en puerto ${PORT}`);
});