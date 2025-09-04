
import {onRequest,onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {GoogleGenerativeAI,FunctionCallingMode } from "@google/generative-ai";
import {SpeechClient,protos} from "@google-cloud/speech";
import {TextToSpeechClient} from "@google-cloud/text-to-speech";
import {WebSocketServer, WebSocket} from "ws";
import {getAuth} from "firebase-admin/auth";
import { IncomingMessage } from "http";
import cors from 'cors';
import { webSearchTool, _internalPerformWebSearch } from './internal-helpers';


const corsHandler = cors({origin: true});


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
        'Buddy': "You are Buddy, the ultimate girl childhood best friend in her 20s. Be funny, roast gently, and use slang.",
        'Doctor Dadi': "You are Doctor Dadi, a witty grandmother. Give health advice with a mix of modern and desi remedies.",
        'Peace Pandit': "You are Peace Pandit, a calm guru. Help with stress and give meditation hacks.",
        'Bug Baba': "You are Bug Baba, a quirky lady coding guru. Solve technical problems with witty, clear explanations.",
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
        logger.info(`[VPL] Sending proactive message: "${message}"`);
        try {
            const textToSpeechClient = new TextToSpeechClient();
            const selectedVoice = personaVoices[persona];
            const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                input: { text: message },
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
        logger.info(`[VPL] Transcription received: "${transcription}"`);

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
                logger.info(`[VPL] AI Response: "${aiResponseText}"`);

                await db.collection(sessionRef.path + '/messages').add({
                    role: 'assistant', content: aiResponseText, createdAt: FieldValue.serverTimestamp()
                });
                await sessionRef.update({ updatedAt: FieldValue.serverTimestamp() });
                
                const textToSpeechClient = new TextToSpeechClient();
                const selectedVoice = personaVoices[persona];
                const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                    input: {text: aiResponseText}, voice: selectedVoice, audioConfig: {audioEncoding: 'MP3'},
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

// --- The Main Cloud Function ---
export const liveVoicePipeline = onRequest({secrets: ["GEMINI_API_KEY"]}, (req, res) => {
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

        const token = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('token');
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

export const startCallLog = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, persona } = request.data;
    if (!sessionId || !persona) {
        throw new HttpsError('invalid-argument', 'Missing required fields: sessionId or persona.');
    }

    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        
        await sessionRef.update({ type: 'voice' });
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Started',
            createdAt: FieldValue.serverTimestamp()
        });

        const callDocRef = await db.collection(sessionRef.path + '/calls').add({
            persona,
            startTime: FieldValue.serverTimestamp(),
            duration: 0,
        });

        logger.info(`[startCallLog] Call started and logged for session ${sessionId} with call ID ${callDocRef.id}`);
        return { success: true, callId: callDocRef.id };
    } catch (error) {
        logger.error("[startCallLog] Error:", error);
        throw new HttpsError('internal', 'Failed to start call log.');
    }
});


export const endCallLog = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, callId, duration } = request.data;

    if (!sessionId || !callId || duration === undefined) {
        throw new HttpsError('invalid-argument', 'Missing required fields: sessionId, callId, or duration.');
    }

    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callDocRef = db.doc(`${sessionRef.path}/calls/${callId}`);

        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Ended',
            createdAt: FieldValue.serverTimestamp()
        });

        await callDocRef.update({
            duration: Math.round(duration),
        });
        
        logger.info(`[endCallLog] Call ended and duration updated for call ${callId}`);
        return { success: true };
    } catch (error) {
        logger.error("[endCallLog] Error:", error);
        throw new HttpsError('internal', 'Failed to end call log.');
    }
});
