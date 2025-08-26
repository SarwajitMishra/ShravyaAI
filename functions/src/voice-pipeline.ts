
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {SpeechClient} from "@google-cloud/speech";
import {TextToSpeechClient} from "@google-cloud/text-to-speech";
import {WebSocketServer, WebSocket} from "ws";
import {getAuth} from "firebase-admin/auth";
import { IncomingMessage } from "http";


// --- Safe Firebase Initialization ---
if (getApps().length === 0) {
    initializeApp();
}

// --- Types ---
type Persona = 'Buddy' | 'Doctor Dadi' | 'Peace Pandit' | 'Bug Baba' | 'Zindagi Guru';

// functions/src/voice-pipeline.ts

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
    return  `${baseInstruction} As ${persona}, ${personaPrompts[persona] || personaPrompts['Buddy']}`;
}

// Add this new helper function
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
// functions/src/voice-pipeline.ts

wss.on('connection', (ws: WebSocket, req: IncomingMessage, uid: string) => {
    logger.info("Client connected to Live Voice Pipeline", { uid });
    let recognizeStream: any = null;
    let persona: Persona = 'Buddy';
    let sessionRef: FirebaseFirestore.DocumentReference | null = null;
    let chat: any = null; // To hold the stateful chat session with the AI



ws.on('message', (message: Buffer) => {
    const msg = JSON.parse(message.toString());

if (msg.event === "start" && uid && msg.sessionId) {
    persona = msg.persona || 'Buddy';
    const sessionId = msg.sessionId;

    // Use an async block to handle the setup sequentially
    (async () => {
        try {
            // LAZY INITIALIZATION of clients
            const speechClient = new SpeechClient();
            const textToSpeechClient = new TextToSpeechClient();
            const genAI = new GoogleGenerativeAI(geminiApiKey);


            // 1. Assign sessionRef. It is now guaranteed to be non-null for the rest of this block.
            sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
            logger.info(`Joining call for user ${uid} in session ${sessionId}`);

            // 2. Log the start of the call immediately.
            const callStartTime = FieldValue.serverTimestamp();
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
                        role: 'user', content: transcription, createdAt: FieldValue.serverTimestamp()
                    });
                    
                    const result = await chat.sendMessage(transcription);
                    const aiResponseText = result.response.text();

                    await db.collection(sessionRef.path + '/messages').add({
                        role: 'assistant', content: aiResponseText, createdAt: FieldValue.serverTimestamp()
                    });
                    await sessionRef.update({ updatedAt: FieldValue.serverTimestamp() });
                    
                    const selectedVoice = personaVoices[persona];
                    const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                        input: {text: aiResponseText}, voice: selectedVoice, audioConfig: {audioEncoding: 'MP3'},
                    });

                    if (ttsResponse.audioContent) {
                        ws.send(JSON.stringify({ event: 'audio', data: (ttsResponse.audioContent as Buffer).toString('base64') }));
                    }
                }
            });

        } catch (error) {
            logger.error(`Error during call start for session ${sessionId}:`, error);
            ws.close();
        }
    })();
}
    else if (msg.event === "audio") {
        if (recognizeStream && msg.data) {
            recognizeStream.write(Buffer.from(msg.data, 'base64'));
        }
    } else if (msg.event === "stop") {
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

export const liveVoicePipeline = onRequest({secrets: ["GEMINI_API_KEY"]}, (req, res) => {
    if (req.headers.upgrade !== 'websocket') {
        res.status(400).send("This endpoint is for WebSocket connections only.");
        return;    
    }


    // 1. Extract and verify the Firebase Auth token from the request URL
    const token = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('token');
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
