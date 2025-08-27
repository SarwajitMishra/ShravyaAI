
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
exports.logCall = exports.liveVoicePipeline = void 0;
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
const corsHandler = (0, cors_1.default)({ origin: true });
// --- Safe Firebase Initialization ---
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
// --- Voice Mapping for Personas ---
const personaVoices = {
    'Buddy': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
    'Doctor Dadi': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
    'Peace Pandit': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C' },
    'Bug Baba': { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
    'Zindagi Guru': { languageCode: 'en-IN', name: 'en-IN-Standard-B' },
};
// --- Firebase and Google Cloud Client Initialization ---
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)(); // Add this line
const geminiApiKey = process.env.GEMINI_API_KEY;
// const genAI = new GoogleGenerativeAI(geminiApiKey);
// const speechClient = new SpeechClient();
// const textToSpeechClient = new TextToSpeechClient();
// --- WebSocket Server Setup ---
const wss = new ws_1.WebSocketServer({ noServer: true });
// --- Core AI Logic ---
// functions/src/voice-pipeline.ts
function getSystemPrompt(persona, transcriptionLanguage) {
    const baseInstruction = `You are a helpful voice assistant powered by Google's Gemini 1.5 model. Your primary goal is to provide a natural, human-like voice response.
    - Keep your sentences short and conversational.
    - Do not include emojis/hastags when you speak.
    - Avoid complex lists or formatting that is hard to listen to.
    - Your response MUST strictly match the language of the user's transcription. For example, if the transcription is in Hinglish, you must reply in Hinglish. If it is in pure Hindi, reply in pure Hindi.`;
    const personaPrompts = {
        'Buddy': "You are Buddy, the ultimate girl childhood best friend in her 20s. Be funny, roast gently, and use slang.",
        'Doctor Dadi': "You are Doctor Dadi, a witty grandmother. Give health advice with a mix of modern and desi remedies.",
        'Peace Pandit': "You are Peace Pandit, a calm guru. Help with stress and give meditation hacks.",
        'Bug Baba': "You are Bug Baba, a quirky lady coding guru. Solve technical problems with witty, clear explanations.",
        'Zindagi Guru': "You are Zindagi Guru, a motivational leader. Inspire with energy and wisdom."
    };
    return `${baseInstruction} As ${persona}, ${personaPrompts[persona] || personaPrompts['Buddy']}`;
}
// functions/src/voice-pipeline.ts
// --- ADD THIS NEW HELPER FUNCTION ---
async function _internalLogCall(uid, sessionId, persona, startTime) {
    try {
        const duration = Date.now() - startTime;
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callDocRef = await db.collection(sessionRef.path + '/calls').add({
            persona,
            startTime: firestore_1.FieldValue.serverTimestamp(),
            endTime: firestore_1.FieldValue.serverTimestamp(),
            duration
        });
        logger.info(`Call logged for session ${sessionId} with ID ${callDocRef.id}`);
        return { success: true, callId: callDocRef.id };
    }
    catch (error) {
        logger.error("Error logging call:", error);
        return { success: false };
    }
}
// Add this new helper function
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
    ws.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        if (msg.event === "start" && uid && msg.sessionId) {
            persona = msg.persona || 'Buddy';
            const sessionId = msg.sessionId;
            // Use an async block to handle the setup sequentially
            (async () => {
                try {
                    // LAZY INITIALIZATION of clients
                    const speechClient = new speech_1.SpeechClient();
                    const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
                    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
                    // 1. Assign sessionRef. It is now guaranteed to be non-null for the rest of this block.
                    sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
                    await sessionRef.update({ type: 'voice' });
                    logger.info(`Joining call for user ${uid} in session ${sessionId}`);
                    await db.collection(sessionRef.path + '/messages').add({
                        role: 'system',
                        content: 'Live Call Started',
                        createdAt: firestore_1.FieldValue.serverTimestamp()
                    });
                    // 2. Log the start of the call immediately.
                    const callStartTime = firestore_1.FieldValue.serverTimestamp();
                    await db.collection(sessionRef.path + '/calls').add({
                        startTime: callStartTime,
                        persona: persona,
                    });
                    // 3. Load the history for the AI.
                    const historySnap = await db.collection(sessionRef.path + '/messages').orderBy('createdAt', 'asc').get();
                    const formattedHistory = formatHistoryForAI(historySnap);
                    // 4. Start the AI chat session with the history.
                    const systemInstruction = getSystemPrompt(persona, 'auto');
                    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest', systemInstruction });
                    chat = model.startChat({ history: formattedHistory });
                    // 5. Start the audio recognition stream.
                    recognizeStream = speechClient.streamingRecognize({
                        config: { encoding: 'WEBM_OPUS', sampleRateHertz: 48000, languageCode: 'en-IN', alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN'] },
                        interimResults: false,
                    })
                        .on('error', (err) => logger.error("Speech Recognition Error:", err))
                        .on('data', async (data) => {
                        const transcription = data.results[0]?.alternatives[0]?.transcript;
                        // We can now safely use sessionRef without checking for null.
                        if (transcription && sessionRef && chat) {
                            await db.collection(sessionRef.path + '/messages').add({
                                role: 'user', content: transcription, createdAt: firestore_1.FieldValue.serverTimestamp()
                            });
                            const result = await chat.sendMessage(transcription);
                            const aiResponseText = result.response.text();
                            await db.collection(sessionRef.path + '/messages').add({
                                role: 'assistant', content: aiResponseText, createdAt: firestore_1.FieldValue.serverTimestamp()
                            });
                            await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
                            const selectedVoice = personaVoices[persona];
                            const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                                input: { text: aiResponseText }, voice: selectedVoice, audioConfig: { audioEncoding: 'MP3' },
                            });
                            if (ttsResponse.audioContent) {
                                ws.send(JSON.stringify({ event: 'audio', data: ttsResponse.audioContent.toString('base64') }));
                            }
                        }
                    });
                }
                catch (error) {
                    logger.error(`Error during call start for session ${sessionId}:`, error);
                    ws.close();
                }
            })();
        }
        else if (msg.event === "audio") {
            if (recognizeStream && msg.data) {
                recognizeStream.write(Buffer.from(msg.data, 'base64'));
            }
        }
        else if (msg.event === "stop") {
            logger.info("Stopping audio stream");
            if (recognizeStream) {
                recognizeStream.end();
                recognizeStream = null;
            }
        }
    });
    ws.on('close', () => {
        logger.info("Client disconnected");
        if (recognizeStream) {
            recognizeStream.end();
            recognizeStream = null;
        }
    });
});
// --- The Main Cloud Function ---
exports.liveVoicePipeline = (0, https_1.onRequest)({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
    if (req.headers.upgrade !== 'websocket') {
        res.status(400).send("This endpoint is for WebSocket connections only.");
        return;
    }
    // 1. Extract and verify the Firebase Auth token from the request URL
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
    if (!token) {
        // This is not a formal response, as the socket will be terminated by the server.
        // It's a necessary check before upgrading the connection.
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
exports.logCall = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    cors: [
        /aishravya\.web\.app$/,
        /aishravya\.firebaseapp\.com$/,
        /cloudworkstations\.dev$/
    ]
}, async (request) => {
    if (!request.auth) {
        logger.error('[logCall] Authentication failed: No token provided.');
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, persona, startTime, duration } = request.data;
    logger.info('[logCall] Received data for user:', uid, { sessionId, persona, startTime, duration });
    if (!sessionId || !persona || !startTime || !duration || isNaN(duration)) {
        logger.error('[logCall] Invalid arguments:', { sessionId, persona, startTime, duration });
        throw new https_1.HttpsError('invalid-argument', 'Missing or invalid required fields.');
    }
    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callData = {
            persona,
            startTime: new Date(startTime),
            duration: Math.round(duration / 1000),
        };
        logger.info('[logCall] Writing to Firestore with data:', callData);
        const callDocRef = await db.collection(sessionRef.path + '/calls').add(callData);
        logger.info('[logCall] Successfully wrote to Firestore, doc ID:', callDocRef.id);
        return { success: true, callId: callDocRef.id };
    }
    catch (error) {
        logger.error("[logCall] Error writing to Firestore:", error);
        throw new https_1.HttpsError('internal', 'Failed to log call data.');
    }
});
