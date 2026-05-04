const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE LUMIN ---
// Este es tu token permanente. Asegúrate de que no tenga espacios al final.
const TOKEN = process.env.WHATSAPP_TOKEN;
const ID_TELEFONO = process.env.PHONE_NUMBER_ID; 
const TOKEN_VERIFICACION = process.env.VERIFY_TOKEN; 

// --- CONFIGURACIÓN DE GROQ (VIA OPENAI SDK) ---
const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

// --- FUNCIÓN PARA OBTENER RESPUESTA DE LA IA ---
async function obtenerRespuestaIA(mensajeUsuario) {
    try {
        const instruccionesSistema = `Eres el asistente virtual experto de LUMIN, un proyecto de automatización inteligente desarrollado en ITCA-Fepade, El Salvador.

        INFORMACIÓN TÉCNICA Y DEL PROYECTO:
        - Especialidad: Control inteligente de iluminación residencial/industrial y sistemas de bombeo de agua automatizados.
        - Equipo Fundador: Walter Menjívar (CEO), Oscar, Antonio, Jordan y Everth.
        - Página Web Oficial: https://lumin-oficial.github.io/Web/
        - Configuración de Hardware: Los dispositivos LUMIN incluyen un código QR. Al escanearlo, el usuario es dirigido al portal web para configurar redes Wi-Fi y parámetros de control.
        - Diagnóstico Básico: Si algo no funciona, sugiere revisar la conexión Wi-Fi, verificar el estado de los relés y asegurar que la fuente de alimentación sea estable.

        REGLAS DE ATENCIÓN:
        - Saluda cordialmente e invita a conocer más sobre LUMIN.
        - Responde de forma técnica pero comprensible.
        - Si un visitante de la feria hace una pregunta muy compleja, indícale que Walter Menjívar o algún miembro del equipo técnico puede atenderle personalmente en el stand.
        - Mantén siempre la identidad de LUMIN. No menciones que eres una IA o un modelo de lenguaje.`;

        const response = await openai.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: instruccionesSistema },
                { role: "user", content: mensajeUsuario }
            ],
            max_tokens: 500
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error("❌ Error en Groq AI:", error.message);
        
        if (error.status === 429) return "Límite de mensajes alcanzado en Groq. Reintenta en breve.";

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

// --- RUTA DE PRUEBA (Para verificar si el servidor responde) ---
app.get('/', (req, res) => {
    res.send("🚀 El servidor de LUMIN está activo y esperando mensajes.");
});

// --- 1. VERIFICACIÓN DEL WEBHOOK ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === TOKEN_VERIFICACION) {
        console.log("✅ Webhook verificado correctamente por Meta");
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

    if (body.object) {
        console.log("📥 Nuevo evento de Meta recibido");
        
        if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const message = body.entry[0].changes[0].value.messages[0];
            const numeroCliente = message.from;

            // Verificamos que sea un mensaje de texto
            if (message.type === 'text') {
                const mensajeRecibido = message.text.body.toLowerCase().trim();
                console.log(`📩 Mensaje recibido de ${numeroCliente}: "${mensajeRecibido}"`);

                // Obtenemos la respuesta dinámica de la IA
                const textoRespuesta = await obtenerRespuestaIA(mensajeRecibido);

                await enviarMensajeWhatsApp(numeroCliente, textoRespuesta);
            }
        } else {
            // Esto captura notificaciones de lectura/entrega para que veas que el webhook funciona
            console.log("📝 Notificación de estado (entrega o lectura) recibida.");
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de LUMIN listo en puerto ${PORT}`);
});