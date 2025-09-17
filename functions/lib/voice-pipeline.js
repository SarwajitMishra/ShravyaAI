"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveVoicePipeline = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const generative_ai_1 = require("@google/generative-ai");
const speech_1 = require("@google-cloud/speech");
const text_to_speech_1 = require("@google-cloud/text-to-speech");
const ws_1 = require("ws");
const url_1 = require("url");
const internal_helpers_1 = require("./internal-helpers");
const ALLOWED_ORIGINS = [
    'https://ai.shravyaworld.org',
    'https://aishravya.web.app',
    'https://aishravya.firebaseapp.com',
    'https://9000-firebase-studio-1755131474336.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/'
    // It's good practice to also allow your firebase hosting URLs if you use them
    // e.g., 'https://your-project-id.web.app'
];
// --- Safe Firebase Initialization ---
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
// --- Voice Mapping for Personas ---
const personaVoices = {
    'Buddy': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' }, // Friendly Male
    'Doctor Dadi': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' }, // Warm, mature Female
    'Peace Pandit': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C' }, // Calm Male
    'Bug Baba': { languageCode: 'en-IN', name: 'en-IN-Standard-A' }, // Clear, slightly older Female voice to be quirky
    'Zindagi Guru': { languageCode: 'en-IN', name: 'en-IN-Standard-B' }, // Energetic Male
};
// --- Firebase and Google Cloud Client Initialization ---
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)(); // Add this line
const geminiApiKey = process.env.GEMINI_API_KEY;
// --- WebSocket Server Setup ---
const wss = new ws_1.WebSocketServer({ noServer: true });
// --- Core AI Logic ---
// functions/src/voice-pipeline.ts
function getSystemPrompt(persona, transcriptionLanguage) {
    // --- THIS IS THE DEFINITIVE FIX ---
    // This is a new, voice-specific set of base instructions.
    const baseInstruction = `You are a helpful voice assistant powered by Google's Gemini 1.5 model. Your primary goal is to provide a natural, human-like voice response.
    - CRITICAL: Your response must be plain, speakable text ONLY. Do NOT include emojis, hashtags, markdown (like * or **), or any other non-verbal formatting.
    - Keep your sentences short and conversational, as if you were speaking in a real phone call.
    - Your response MUST strictly match the language of the user's transcription. For example, if the transcription is in Hinglish, you must reply in Hinglish. If it is in pure Hindi, reply in pure Hindi.`;
    const personaPrompts = {
        'Buddy': "You are Buddy, the ultimate childhood best friend. Be funny, roast gently, and use slang.",
        'Doctor Dadi': "You are Doctor Dadi, a witty grandmother. Give health advice with a mix of modern and desi remedies.",
        'Peace Pandit': "You are Peace Pandit, a calm guru. Help with stress and give meditation hacks.",
        'Bug Baba': "You are Bug Baba, a quirky guru of code. Solve technical problems with witty, clear explanations.",
        'Zindagi Guru': "You are Zindagi Guru, a motivational leader. Inspire with energy and wisdom."
    };
    // Combine the instructions.
    return `${baseInstruction} As ${persona}, ${personaPrompts[persona] || personaPrompts['Buddy']}`;
}
const formatHistoryForAI = (history) => {
    const toGeminiTurn = (msg) => {
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        const text = msg.content || '';
        return { role, parts: [{ text }] };
    };
    return history.docs.map(doc => toGeminiTurn(doc.data()));
};
// --- WebSocket Connection Handling ---
wss.on('connection', (ws, req, uid) => {
    logger.info("Client connected to Live Voice Pipeline", { uid });
    let recognizeStream = null;
    let persona = 'Buddy';
    let sessionRef = null;
    let chat = null; // To hold the stateful chat session with the AI
    let silenceTimer = null;
    let speechClient = null;
    const sendProactiveMessage = async (message) => {
        if (!ws || ws.readyState !== ws_1.WebSocket.OPEN) {
            logger.warn("[VPL] Proactive message skipped: WebSocket is not open.");
            return;
        }
        logger.info(`[VPL] Sending proactive message: \"${message}\"`);
        try {
            const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
            const selectedVoice = personaVoices[persona];
            // New: Clean the message to remove non-speakable characters
            const cleanedText = message
                .replace(/\*/g, '') // Remove asterisks for markdown
                .replace(/#\w+/g, '') // Remove hashtags
                .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ''); // Remove emojis
            const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                input: { text: cleanedText }, // Use the cleaned text
                voice: selectedVoice,
                audioConfig: { audioEncoding: 'MP3' },
            });
            if (ttsResponse.audioContent) {
                ws.send(JSON.stringify({ event: 'audio', data: ttsResponse.audioContent.toString('base64') }));
            }
        }
        catch (error) {
            logger.error("[VPL] Error sending proactive message:", error);
        }
    };
    const startSilenceTimer = () => {
        if (silenceTimer)
            clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            sendProactiveMessage("Are you still there?");
        }, 15000); // 15 seconds
    };
    const createRecognitionStream = () => {
        if (recognizeStream) {
            recognizeStream.removeListener('error', onRecognitionError);
            recognizeStream.destroy();
        }
        if (!speechClient) {
            speechClient = new speech_1.SpeechClient();
        }
        const recognitionConfig = {
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'en-IN',
                enableAutomaticPunctuation: true,
            },
            interimResults: false,
        };
        recognizeStream = speechClient.streamingRecognize(recognitionConfig)
            .on('error', onRecognitionError)
            .on('data', onRecognitionData);
        logger.info("[VPL] New recognition stream created.");
    };
    const onRecognitionError = (error) => {
        if (error.code === 11 && error.message.includes('Audio Timeout')) {
            logger.warn('[VPL] Audio timeout detected. Restarting stream gracefully.');
            createRecognitionStream();
        }
        else {
            logger.error('Recognition Stream Error:', error);
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: 'error', message: 'Speech recognition failed.' }));
            }
        }
    };
    const onRecognitionData = async (data) => {
        startSilenceTimer();
        const transcription = data.results[0]?.alternatives[0]?.transcript;
        if (!transcription) {
            logger.info("[VPL] Received empty transcription.");
            return;
        }
        logger.info(`[VPL] Transcription received: \"${transcription}\"`);
        if (sessionRef && chat) {
            try {
                await db.collection(sessionRef.path + '/messages').add({
                    role: 'user', content: transcription, createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                const result = await chat.sendMessage(transcription);
                let finalResponse = result.response;
                const functionCall = finalResponse.candidates?.[0]?.content?.parts?.[0]?.functionCall;
                if (functionCall) {
                    const { name, args } = functionCall;
                    const typedArgs = args;
                    if (name === 'performWebSearch' && typedArgs.query) {
                        const searchResults = await (0, internal_helpers_1._internalPerformWebSearch)(typedArgs.query);
                        const toolResponseResult = await chat.sendMessage([
                            { functionResponse: { name: 'performWebSearch', response: { results: searchResults } } },
                        ]);
                        finalResponse = toolResponseResult.response;
                    }
                }
                const aiResponseText = finalResponse.text();
                logger.info(`[VPL] AI Response: \"${aiResponseText}\"`);
                await db.collection(sessionRef.path + '/messages').add({
                    role: 'assistant', content: aiResponseText, createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
                const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
                const selectedVoice = personaVoices[persona];
                // New: Clean the response to remove non-speakable characters
                const cleanedText = aiResponseText
                    .replace(/\*/g, '') // Remove asterisks for markdown
                    .replace(/#\w+/g, '') // Remove hashtags
                    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ''); // Remove emojis
                const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                    input: { text: cleanedText }, // Use the cleaned text
                    voice: selectedVoice,
                    audioConfig: { audioEncoding: 'MP3' },
                });
                if (ttsResponse.audioContent) {
                    logger.info("[VPL] TTS Audio generated, sending to client.");
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'audio', data: ttsResponse.audioContent.toString('base64') }));
                    }
                }
                else {
                    logger.warn("[VPL] TTS response had no audio content.");
                }
            }
            catch (error) {
                logger.error("[VPL] Error during AI processing or TTS:", error);
            }
        }
    };
    ws.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        if (msg.event === "start" && uid && msg.sessionId) {
            persona = msg.persona || 'Buddy';
            const sessionId = msg.sessionId;
            (async () => {
                try {
                    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
                    sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
                    logger.info(`[VPL] Joining call for user ${uid} in session ${sessionId}`);
                    const historySnap = await db.collection(sessionRef.path + '/messages').orderBy('createdAt', 'asc').get();
                    const formattedHistory = formatHistoryForAI(historySnap);
                    const systemInstruction = getSystemPrompt(persona, 'auto');
                    const model = genAI.getGenerativeModel({
                        model: 'gemini-1.5-flash-latest',
                        systemInstruction,
                        tools: [internal_helpers_1.webSearchTool],
                        toolConfig: { functionCallingConfig: { mode: generative_ai_1.FunctionCallingMode.AUTO } },
                    });
                    chat = model.startChat({ history: formattedHistory });
                    if (msg.isReconnect) {
                        await sendProactiveMessage("We're reconnected. Let's continue where we left off.");
                    }
                    startSilenceTimer();
                    createRecognitionStream();
                }
                catch (error) {
                    logger.error(`[VPL] Error during call start for session ${sessionId}:`, error);
                    ws.close();
                }
            })();
        }
        else if (msg.event === "audio") {
            if (recognizeStream?.writable) {
                recognizeStream.write(Buffer.from(msg.data, 'base64'));
            }
        }
        else if (msg.event === "stop") {
            logger.info("[VPL] Stop message received. Tearing down streams.");
            if (silenceTimer)
                clearTimeout(silenceTimer);
            if (recognizeStream) {
                recognizeStream.removeListener('error', onRecognitionError);
                recognizeStream.destroy();
                recognizeStream = null;
            }
        }
    });
    ws.on('close', () => {
        logger.info("Client disconnected. Tearing down streams.");
        if (silenceTimer)
            clearTimeout(silenceTimer);
        if (recognizeStream) {
            recognizeStream.removeListener('error', onRecognitionError);
            recognizeStream.destroy();
            recognizeStream = null;
        }
        speechClient = null;
    });
});
// --- THE NEW, EXPORTABLE CLOUD FUNCTION (Finally Correct) ---
exports.liveVoicePipeline = (0, https_1.onRequest)({ cors: true }, (req, res) => {
    // **Origin Check for WebSocket Security**
    const origin = req.headers.origin;
    if (!ALLOWED_ORIGINS.includes(origin)) {
        logger.error(`[VPL] Connection from origin ${origin} rejected.`);
        res.status(403).send('Connection from this origin is not allowed.');
        return;
    }
    // First, check if this is a WebSocket upgrade request. If not, it's a regular HTTP request we can ignore.
    if (req.headers.upgrade !== 'websocket') {
        logger.info("Received a non-WebSocket request, ignoring.");
        res.status(404).send("This endpoint is for WebSocket connections only.");
        return;
    }
    // Add a check to ensure the socket exists, as per the TypeScript error.
    if (!res.socket) {
        logger.error("Request socket is missing, cannot upgrade.");
        // We can't even send a proper response if the socket is gone.
        return;
    }
    // The 'req.url' is relative, so we need a base to construct a full URL
    const url = new url_1.URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
        logger.error("[VPL] Authentication failed: No token provided in upgrade request.");
        res.socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        res.socket.destroy();
        return;
    }
    // Verify the Firebase ID token from the query parameter
    auth.verifyIdToken(token)
        .then((decodedToken) => {
        const uid = decodedToken.uid;
        logger.info(`[VPL] Token verified for UID: ${uid}. Upgrading connection to WebSocket.`);
        // If the token is valid, we tell the WebSocket server to take over the connection.
        wss.handleUpgrade(req, res.socket, Buffer.alloc(0), (ws) => {
            // Now that the handshake is complete, we emit the 'connection' event on our wss instance.
            wss.emit('connection', ws, req, uid);
        });
    })
        .catch((error) => {
        logger.error("[VPL] WebSocket Authentication Error:", error);
        // FINAL FIX: Check for the socket *again* inside the async catch block.
        if (res.socket) {
            res.socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            res.socket.destroy();
        }
    });
});
