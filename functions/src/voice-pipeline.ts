import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import { SpeechClient, protos } from "@google-cloud/speech";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { URL } from 'url';

import { webSearchTool, _internalPerformWebSearch } from './internal-helpers';

const ALLOWED_ORIGINS = [
    'https://ai.shravyaworld.org',
    'https://aishravya.web.app',
    'https://aishravya.firebaseapp.com',
    'https://9000-firebase-studio-1755131474336.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/'
    // It's good practice to also allow your firebase hosting URLs if you use them
    // e.g., 'https://your-project-id.web.app'
];

// --- Safe Firebase Initialization ---
if (getApps().length === 0) {
    initializeApp();
}

// --- Types ---
type Persona = 'Buddy' | 'Doctor Dadi' | 'Peace Pandit' | 'Bug Baba' | 'Zindagi Guru';


// --- Voice Mapping for Personas ---
const personaVoices: Record<Persona, { languageCode: string; name: string }> = {
    'Buddy': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' }, // Friendly Male
    'Doctor Dadi': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' }, // Warm, mature Female
    'Peace Pandit': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C' }, // Calm Male
    'Bug Baba': { languageCode: 'en-IN', name: 'en-IN-Standard-A' },   // Clear, slightly older Female voice to be quirky
    'Zindagi Guru': { languageCode: 'en-IN', name: 'en-IN-Standard-B' }, // Energetic Male
};


// --- Firebase and Google Cloud Client Initialization ---
const db = getFirestore();
const auth = getAuth(); // Add this line
const geminiApiKey = process.env.GEMINI_API_KEY!;


// --- WebSocket Server Setup ---
const wss = new WebSocketServer({noServer: true});

// --- Core AI Logic ---
// functions/src/voice-pipeline.ts

function getSystemPrompt(persona: Persona, transcriptionLanguage: string): string {
    // --- THIS IS THE DEFINITIVE FIX ---
    // This is a new, voice-specific set of base instructions.
    const baseInstruction = `You are a helpful voice assistant powered by Google's Gemini 1.5 model. Your primary goal is to provide a natural, human-like voice response.
    - CRITICAL: Your response must be plain, speakable text ONLY. Do NOT include emojis, hashtags, markdown (like * or **), or any other non-verbal formatting.
    - Keep your sentences short and conversational, as if you were speaking in a real phone call.
    - Your response MUST strictly match the language of the user's transcription. For example, if the transcription is in Hinglish, you must reply in Hinglish. If it is in pure Hindi, reply in pure Hindi.`;

    const personaPrompts: Record<Persona, string> = {
        'Buddy': "You are Buddy, the ultimate childhood best friend. Be funny, roast gently, and use slang.",
        'Doctor Dadi': "You are Doctor Dadi, a witty grandmother. Give health advice with a mix of modern and desi remedies.",
        'Peace Pandit': "You are Peace Pandit, a calm guru. Help with stress and give meditation hacks.",
        'Bug Baba': "You are Bug Baba, a quirky guru of code. Solve technical problems with witty, clear explanations.",
        'Zindagi Guru': "You are Zindagi Guru, a motivational leader. Inspire with energy and wisdom."
    };
    
    // Combine the instructions.
    return `${baseInstruction} As ${persona}, ${personaPrompts[persona] || personaPrompts['Buddy']}`;
}


const formatHistoryForAI = (history: FirebaseFirestore.QuerySnapshot): any[] => {
    type RawMsg = { role: 'user' | 'assistant' | 'model'; content?: string; };
    const toGeminiTurn = (msg: RawMsg) => {
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        const text = msg.content || '';
        return { role, parts: [{ text }] };
    };
    return history.docs.map(doc => toGeminiTurn(doc.data() as RawMsg));
};


// --- WebSocket Connection Handling ---
wss.on('connection', (ws: WebSocket, req: IncomingMessage, uid: string) => {
    logger.info("Client connected to Live Voice Pipeline", { uid });
    let recognizeStream: any = null;
    let persona: Persona = 'Buddy';
    let sessionRef: FirebaseFirestore.DocumentReference | null = null;
    let chat: any = null; // To hold the stateful chat session with the AI
    let silenceTimer: NodeJS.Timeout | null = null;
    let speechClient: SpeechClient | null = null;


    const sendProactiveMessage = async (message: string) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            logger.warn("[VPL] Proactive message skipped: WebSocket is not open.");
            return;
        }
        logger.info(`[VPL] Sending proactive message: \"${message}\"`);
        try {
            const textToSpeechClient = new TextToSpeechClient();
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
                ws.send(JSON.stringify({ event: 'audio', data: (ttsResponse.audioContent as Buffer).toString('base64') }));
            }
        } catch (error) {
            logger.error("[VPL] Error sending proactive message:", error);
        }
    };

    const startSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
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
            speechClient = new SpeechClient();
        }

        const recognitionConfig: protos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
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

    const onRecognitionError = (error: Error & { code?: number }) => {
        if (error.code === 11 && error.message.includes('Audio Timeout')) {
            logger.warn('[VPL] Audio timeout detected. Restarting stream gracefully.');
            createRecognitionStream();
        } else {
            logger.error('Recognition Stream Error:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: 'error', message: 'Speech recognition failed.' }));
            }
        }
    };

    const onRecognitionData = async (data: any) => {
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
                    role: 'user', content: transcription, createdAt: FieldValue.serverTimestamp()
                });

                const result = await chat.sendMessage(transcription);
                let finalResponse = result.response;
                
                const functionCall = finalResponse.candidates?.[0]?.content?.parts?.[0]?.functionCall;
                if (functionCall) {
                    const { name, args } = functionCall;
                    const typedArgs = args as { query?: string };
                    if (name === 'performWebSearch' && typedArgs.query) {
                        const searchResults = await _internalPerformWebSearch(typedArgs.query);
                        const toolResponseResult = await chat.sendMessage([
                            { functionResponse: { name: 'performWebSearch', response: { results: searchResults } } },
                        ]);
                        finalResponse = toolResponseResult.response;
                    }
                }
                
                const aiResponseText = finalResponse.text();
                logger.info(`[VPL] AI Response: \"${aiResponseText}\"`);

                await db.collection(sessionRef.path + '/messages').add({
                    role: 'assistant', content: aiResponseText, createdAt: FieldValue.serverTimestamp()
                });
                await sessionRef.update({ updatedAt: FieldValue.serverTimestamp() });
                
                const textToSpeechClient = new TextToSpeechClient();
                const selectedVoice = personaVoices[persona];
                // New: Clean the response to remove non-speakable characters
                const cleanedText = aiResponseText
                        .replace(/\*/g, '') // Remove asterisks for markdown
                        .replace(/#\w+/g, '') // Remove hashtags
                        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ''); // Remove emojis

                const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                        input: {text: cleanedText}, // Use the cleaned text
                        voice: selectedVoice,
                        audioConfig: {audioEncoding: 'MP3'},
                        });


                if (ttsResponse.audioContent) {
                    logger.info("[VPL] TTS Audio generated, sending to client.");
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'audio', data: (ttsResponse.audioContent as Buffer).toString('base64') }));
                    }
                } else {
                    logger.warn("[VPL] TTS response had no audio content.");
                }
            } catch (error) {
                logger.error("[VPL] Error during AI processing or TTS:", error);
            }
        }
    };

    ws.on('message', (message: Buffer) => {
        const msg = JSON.parse(message.toString());

        if (msg.event === "start" && uid && msg.sessionId) {
            persona = msg.persona || 'Buddy';
            const sessionId = msg.sessionId;

            (async () => {
                try {
                    const genAI = new GoogleGenerativeAI(geminiApiKey);

                    sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
                    logger.info(`[VPL] Joining call for user ${uid} in session ${sessionId}`);

                    const historySnap = await db.collection(sessionRef.path + '/messages').orderBy('createdAt', 'asc').get();
                    const formattedHistory = formatHistoryForAI(historySnap);
                    
                    const systemInstruction = getSystemPrompt(persona, 'auto');
                    const model = genAI.getGenerativeModel({
                        model: 'gemini-1.5-flash-latest',
                        systemInstruction,
                        tools: [webSearchTool],
                        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
                    });
                    chat = model.startChat({ history: formattedHistory });
                    
                    if (msg.isReconnect) {
                        await sendProactiveMessage("We're reconnected. Let's continue where we left off.");
                    }
                    
                    startSilenceTimer();
                    createRecognitionStream();

                } catch (error) {
                    logger.error(`[VPL] Error during call start for session ${sessionId}:`, error);
                    ws.close();
                }
            })();
        } else if (msg.event === "audio") {
            if (recognizeStream?.writable) {
                recognizeStream.write(Buffer.from(msg.data, 'base64'));
            }
        } else if (msg.event === "stop") {
            logger.info("[VPL] Stop message received. Tearing down streams.");
            if (silenceTimer) clearTimeout(silenceTimer);
            if (recognizeStream) {
                recognizeStream.removeListener('error', onRecognitionError);
                recognizeStream.destroy();
                recognizeStream = null;
            }
        }
    });

    ws.on('close', () => {
        logger.info("Client disconnected. Tearing down streams.");
        if (silenceTimer) clearTimeout(silenceTimer);
        if (recognizeStream) {
            recognizeStream.removeListener('error', onRecognitionError);
            recognizeStream.destroy();
            recognizeStream = null;
        }
        speechClient = null;
    });
});

// --- THE NEW, EXPORTABLE CLOUD FUNCTION (Finally Correct) ---
export const liveVoicePipeline = onRequest({ cors: true }, (req, res) => {
    // **Origin Check for WebSocket Security**
    const origin = req.headers.origin as string;
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
    const url = new URL(req.url!, `http://${req.headers.host}`);
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
            wss.handleUpgrade(req, res.socket as any, Buffer.alloc(0), (ws) => {
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
