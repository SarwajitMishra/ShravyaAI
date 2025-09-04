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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.endCallLog = exports.startCallLog = exports.liveVoicePipeline = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const generative_ai_1 = require("@google/generative-ai");
const speech_1 = require("@google-cloud/speech");
const text_to_speech_1 = require("@google-cloud/text-to-speech");
const ws_1 = require("ws");
const auth_1 = require("firebase-admin/auth");
const cors_1 = __importDefault(require("cors"));
const internal_helpers_1 = require("./internal-helpers");
const corsHandler = (0, cors_1.default)({ origin: true });
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
        'Buddy': "You are Buddy, the ultimate girl childhood best friend in her 20s. Be funny, roast gently, and use slang.",
        'Doctor Dadi': "You are Doctor Dadi, a witty grandmother. Give health advice with a mix of modern and desi remedies.",
        'Peace Pandit': "You are Peace Pandit, a calm guru. Help with stress and give meditation hacks.",
        'Bug Baba': "You are Bug Baba, a quirky lady coding guru. Solve technical problems with witty, clear explanations.",
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
        logger.info(`[VPL] Sending proactive message: "${message}"`);
        try {
            const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
            const selectedVoice = personaVoices[persona];
            const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                input: { text: message },
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
        logger.info(`[VPL] Transcription received: "${transcription}"`);
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
                logger.info(`[VPL] AI Response: "${aiResponseText}"`);
                await db.collection(sessionRef.path + '/messages').add({
                    role: 'assistant', content: aiResponseText, createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
                const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
                const selectedVoice = personaVoices[persona];
                const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                    input: { text: aiResponseText }, voice: selectedVoice, audioConfig: { audioEncoding: 'MP3' },
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
// --- The Main Cloud Function ---
exports.liveVoicePipeline = (0, https_1.onRequest)({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
    corsHandler(req, res, () => {
        // HTTP Ping for debugging rewrite rule
        if (req.method === 'GET') {
            logger.info("[VPL] Received HTTP GET request. Responding with success.");
            res.status(200).send("Function is reachable.");
            return;
        }
        if (req.headers.upgrade !== 'websocket') {
            res.status(400).send("This endpoint is for WebSocket connections only.");
            return;
        }
        const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
        if (!token) {
            req.socket.destroy();
            return;
        }
        auth.verifyIdToken(token)
            .then((decodedToken) => {
            const uid = decodedToken.uid;
            wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
                wss.emit('connection', ws, req, uid);
            });
        })
            .catch((error) => {
            logger.error("WebSocket Authentication Error:", error);
            req.socket.destroy();
        });
    });
});
// --- New Logging Functions ---
exports.startCallLog = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, persona } = request.data;
    if (!sessionId || !persona) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: sessionId or persona.');
    }
    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        await sessionRef.update({ type: 'voice' });
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Started',
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        const callDocRef = await db.collection(sessionRef.path + '/calls').add({
            persona,
            startTime: firestore_1.FieldValue.serverTimestamp(),
            duration: 0,
        });
        logger.info(`[startCallLog] Call started and logged for session ${sessionId} with call ID ${callDocRef.id}`);
        return { success: true, callId: callDocRef.id };
    }
    catch (error) {
        logger.error("[startCallLog] Error:", error);
        throw new https_1.HttpsError('internal', 'Failed to start call log.');
    }
});
exports.endCallLog = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, callId, duration } = request.data;
    if (!sessionId || !callId || duration === undefined) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: sessionId, callId, or duration.');
    }
    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callDocRef = db.doc(`${sessionRef.path}/calls/${callId}`);
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Ended',
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        await callDocRef.update({
            duration: Math.round(duration),
        });
        logger.info(`[endCallLog] Call ended and duration updated for call ${callId}`);
        return { success: true };
    }
    catch (error) {
        logger.error("[endCallLog] Error:", error);
        throw new https_1.HttpsError('internal', 'Failed to end call log.');
    }
});
