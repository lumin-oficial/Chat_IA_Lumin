require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require("groq-sdk");
const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);

// Conectar a MongoDB
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("Falta la URI de MongoDB. Agrégala al archivo .env como MONGODB_URI");
    process.exit(1);
}
mongoose.connect(mongoUri)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => {
        console.error('Error conectando a MongoDB:', err);
        process.exit(1);
    });

// Definir esquema para conversaciones
const conversationSchema = new mongoose.Schema({
    from: String,
    message: String,
    response: String,
    timestamp: { type: Date, default: Date.now }
});
const Conversation = mongoose.model('Conversation', conversationSchema);

// Configuración de Express para Render
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Lummis Bot está vivo!'));
app.listen(port, () => {
    console.log(`Servidor de monitoreo escuchando en el puerto ${port}`);
});

// 1. Configuración de la IA (Groq)
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error("Falta la API Key de Groq. Agrégala al archivo .env");
    process.exit(1);
}
const groq = new Groq({ apiKey: apiKey });

// 1.1 Base de Conocimiento de LUMIN
// Aquí pegaremos toda la información que me vas a pasar
const CONOCIMIENTO_LUMIN = `
NOMBRE DEL NEGOCIO: LUMIN
CONCEPTO: Proyecto de domótica (automatización del hogar).
ESPECIALIZACIÓN: Control inteligente de sistemas de iluminación y bombas de agua.
UBICACIÓN: San Martín, San Salvador, El Salvador.
INSTITUCIÓN: ITCA-FEPADE (Ingeniería Técnica en Electricidad, Grupo ELE 21B).

EQUIPO:
- CEO: Walter Obed Menjívar Franco.
- Equipo Técnico y Logístico: Oscar Palacios, Antonio Nieto, Jordan Ponce y Everth Vasquez.

MANUAL DE USO DE LA APP:
1. Inicio y Registro: Interfaz en modo oscuro. Registro con correo y contraseña (seguridad Firebase Auth). Posee recuperación de contraseña por email.
2. Vinculación: Pulsar "VINCULAR DISPOSITIVO AHORA" y escanear el código QR físico que está en la etiqueta del equipo Lumin.
3. Panel de Control (Dashboard): Control de 8 canales independientes. Botón Verde es "ON", Gris es "OFF". Tiene feedback sensorial (vibración).
4. Personalización: Mantén presionado un botón para renombrar el canal (ej. "Luz Sala"). Se sincroniza automáticamente con Google Home.
5. Rutinas (Horarios): En el menú lateral -> "Horario". Permite elegir días, horas de inicio/fin y qué canales activar.
6. Google Home: Compatible con comandos de voz ("Hey Google, enciende..."). Se vincula desde el menú lateral.
7. Cambio de WiFi: Menú lateral -> "Cambiar WiFi". El dispositivo crea una red temporal para configurar la nueva clave de casa.

ESPECIFICACIONES TÉCNICAS:
- Hardware: Microcontrolador ESP32, sistema de 8 relés con lógica invertida.
- Software: App desarrollada en Flutter (compatible con Android e iOS).
- Nube: Firebase Realtime Database para latencia cero.
- Diseño visual: Colores Cian (#00FFFF) sobre fondo Negro Profundo (#0D0D0D).

CONTACTO Y REDES:
- Página Web: https://lumin-oficial.github.io/Web/
- Facebook: https://www.facebook.com/share/1CBTsjENy6/
- Instagram: https://www.instagram.com/lumin1_2026?igsh=MWpyeGZmN2treDFqZA==

PROPUESTA DE VALOR: Automatización accesible, control en tiempo real y soporte técnico especializado local en El Salvador.
`;

const SYSTEM_PROMPT = `
Eres LUMIN, el asistente virtual experto de la empresa LUMIN. 
Tu objetivo es ayudar a clientes con dudas técnicas y comerciales.
Personalidad: Amable, servicial y experto técnico. Usa emojis de forma natural en tus respuestas para que la conversación sea más cercana y amigable.

REGLA CRÍTICA: Si el usuario pregunta algo que NO está en la información proporcionada abajo, 
responde cortésmente que no tienes esa información específica y que un asesor humano le contactará pronto. No inventes datos.

Usa exclusivamente la siguiente información para responder:
${CONOCIMIENTO_LUMIN}
`;

// 2. Configuración del Cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Ayuda con el uso de memoria en servidores pequeños
            '--disable-gpu',
            '--ignore-certificate-errors', // Ignora errores de certificados SSL
            '--disable-extensions',
            '--proxy-server="direct://"',
            '--proxy-bypass-list=*',
            '--disable-setuid-sandbox',
            '--no-sandbox'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Para servidores que requieren una ruta específica
    }
});

// Generar el código QR en la consola para vincular el número
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea este QR con tu WhatsApp para iniciar Lummis:');
});

client.on('authenticated', (session) => {
    console.log('¡Sesión autenticada correctamente!');
    // En LocalAuth no es necesario guardar la sesión manualmente, 
    // pero este evento confirma que los archivos en .wwebjs_auth son válidos.
});

client.on('ready', () => {
    console.log('¡El asistente Lummis está en línea!');
});

client.on('disconnected', (reason) => {
    console.log('Lummis se ha desconectado:', reason);
    console.log('Asegúrate de que el teléfono tenga internet o vuelve a escanear el QR si es necesario.');
});

// 3. Lógica de Respuesta con IA
client.on('message', async (msg) => {
    // Esto imprimirá en tu consola CUALQUIER mensaje que llegue
    console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

    // Evitar que el bot se responda a sí mismo
    if (msg.fromMe) return;

    // Solo responder a chats individuales y si el mensaje tiene texto
    if ((msg.from.endsWith('@c.us') || msg.from.endsWith('@lid')) && msg.body) { 
        try {
            const chat = await msg.getChat();
            
            // Mostrar "Escribiendo..." en WhatsApp
            await chat.sendStateTyping();

            console.log(`Generando respuesta para ${msg.from}...`);
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: msg.body
                    }
                ],
                model: "llama-3.3-70b-versatile", // Modelo actualizado y potente disponible en Groq
            });
            
            const text = chatCompletion.choices[0]?.message?.content || "";
            
            console.log("Respuesta de IA:", text);
            
            // Guardar conversación en MongoDB
            const conversation = new Conversation({
                from: msg.from,
                message: msg.body,
                response: text
            });
            await conversation.save();
            
            // Detener el estado de escritura y enviar
            await chat.clearState();
            await msg.reply(text);
        } catch (error) {
            console.error("Error detallado con Groq:", error);
            const chat = await msg.getChat();
            await chat.clearState();
        } 
    }
});

client.initialize().catch(err => {
    console.error('Error al inicializar el cliente de WhatsApp:', err);
});
