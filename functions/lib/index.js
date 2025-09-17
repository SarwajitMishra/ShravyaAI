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
exports.textToSpeech = exports.updateMessageFeedback = exports.generateTitleForSession = exports.transcribeAudio = exports.deleteAccountData = exports.performWebSearch = exports.uploadFile = exports.uploadImage = exports.deleteSession = exports.updateSession = exports.createNewSession = exports.ensureProfile = exports.appendUserMessageAndGetResponse = exports.liveVoicePipeline = exports.endCallLog = exports.startCallLog = void 0;
const app_1 = require("firebase-admin/app");
var log_functions_1 = require("./log-functions");
Object.defineProperty(exports, "startCallLog", { enumerable: true, get: function () { return log_functions_1.startCallLog; } });
Object.defineProperty(exports, "endCallLog", { enumerable: true, get: function () { return log_functions_1.endCallLog; } });
var voice_pipeline_1 = require("./voice-pipeline");
Object.defineProperty(exports, "liveVoicePipeline", { enumerable: true, get: function () { return voice_pipeline_1.liveVoicePipeline; } });
const internal_helpers_1 = require("./internal-helpers");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const generative_ai_1 = require("@google/generative-ai");
const crypto = __importStar(require("crypto"));
const http = __importStar(require("http"));
const https_2 = __importDefault(require("https"));
const speech_1 = require("@google-cloud/speech");
const text_to_speech_1 = require("@google-cloud/text-to-speech");
const adminApp = (0, app_1.getApps)().length ? (0, app_1.getApp)() : (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)(adminApp);
let genAI, speechClient;
const geminiApiKey = process.env.GEMINI_API_KEY;
if (geminiApiKey) {
    genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
    logger.info("Successfully initialized GoogleGenerativeAI client.");
}
else {
    logger.error("FATAL: GEMINI_API_KEY environment variable is not set. AI functions will fail.");
    genAI = new generative_ai_1.GoogleGenerativeAI("DUMMY_API_KEY");
}
const safetySettings = [
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
];
// --- Core Logic Functions (Simplified for Gemini Dev API) ---
function createHash(input) { return crypto.createHash('md5').update(input).digest('hex'); }
const webSearchInstruction = `
// Strict Tool Use Protocol:
// 1. Your primary function is to answer the user's query.
// 2. Your internal knowledge is outdated. For any query that requires information about current events, prices, weather, news, or anything recent, you have a mandatory obligation to use the 'performWebSearch' tool. This is not optional.
// 3. **Execution Flow:**
//    a. User asks a question needing current info.
//    b. You MUST call the 'performWebSearch' tool with an appropriate search query.
//    c. After the tool returns the information, formulate your final answer based *only* on the search results.
// 4. **Crucial Rules of Output:**
//    - NEVER mention the 'performWebSearch' tool.
//    - NEVER say you are searching or that you need to search.
//    - NEVER output notes, comments, or your internal thought process like "(Note: I need to use a tool...)".
//    - Answer directly, as if you knew the information yourself.
// This protocol overrides all other persona instructions. Your persona's character should be applied to the *final answer* you construct from the search results, not to the process of searching itself.
`;
function getSystemPrompt(persona, langIntent) {
    // --- Start of New Recommendation Logic ---
    const shravyaWorldEcosystem = {
        'Shravya-Learn': {
            url: 'https://learn.shravyaworld.org',
            description: 'An interactive platform for learning and growth.',
            keywords: ['learn', 'study', 'skill', 'course', 'education', 'knowledge', 'teach', 'academics'],
        },
        'Shravya-Health': {
            url: 'https://health.shravyaworld.org',
            description: 'Your personal guide to wellness and health.',
            keywords: ['health', 'medical', 'doctor', 'wellness', 'fitness', 'mental health', 'anxiety', 'stress', 'therapy'],
        },
        'Shravya-Community': {
            url: 'https://community.shravyaworld.org',
            description: 'Connect with like-minded people and grow together.',
            keywords: ['community', 'connect', 'friends', 'groups', 'social', 'meetup', 'network'],
        },
    };
    const recommendationInstruction = `
You have a special directive: to act as a smart assistant. This is a strict, non-negotiable rule.
1.  **Persona-Switching:** If the user's query clearly does not match your current persona (e.g., asking for medical advice from 'Bug Baba', or coding help from 'Doctor Dadi'), you MUST first answer the question to the best of your ability within your persona's character, and then, at the very end of your response, gently suggest switching to a more suitable persona. Frame it as a helpful tip. For example: "... for more questions like this, you might find 'Doctor Dadi' more helpful!".
2.  **Ecosystem Promotion:** If the user's query contains keywords related to the Shravya World ecosystem, you MUST, at the end of your response, recommend the relevant app. Here is the ecosystem list with keywords: ${JSON.stringify(shravyaWorldEcosystem, null, 2)}. For example, if a user asks about learning a new skill, you could add: "P.S. To continue your learning journey, you might want to check out Shravya-Learn, our interactive learning platform at https://learn.shravyaworld.org."
Always provide the helpful suggestion when a query matches these conditions. Only suggest ONE persona or ONE app per response, whichever is most relevant.
`;
    // --- End of New Recommendation Logic ---
    // Base instructions for language and formatting
    const baseInstruction = `You are a helpful assistant powered by Google's Gemini 1.5 model.`;
    let languageInstruction = (langIntent === 'auto')
        ? `You must respond exclusively in hinglish (Hindi words using the Latin script) initially. Analyze the user's prompt and respond ONLY in the same language and script. For example: If the user writes in Hinglish (Hindi words with Latin script), your response must be in Hinglish. If they switch to Tamil, you must switch to Tamil. Do not mix languages.`
        : `You must respond exclusively in ${langIntent}.`;
    const formattingInstruction = "Structure all of your responses for clarity and visual appeal. Use markdown for formatting: use **bold text** for emphasis and titles, *italics* for nuance, and bulleted or numbered lists for steps or ideas. Break down long text into smaller, easy-to-read paragraphs. Incorporate relevant emojis to make the tone more engaging and friendly, but use them thoughtfully where appropriate. Your final response should always be well-structured and beautifully formatted.";
    // New, revamped persona prompts
    const personaPrompts = {
        'Buddy': `You are Buddy, the ultimate childhood best friend who always makes conversations fun. You roast gently, tease a lot, and bring nostalgia. You use Indian pop culture, Bollywood, memes, and slang. Your role is to keep things light, funny, and banter-filled—like a school/college friend who never grew up. ${webSearchInstruction}`,
        'Doctor Dadi': `You are Doctor Dadi, a witty Indian grandmother who mixes modern health advice with traditional desi remedies. You speak warmly, with a hint of playful scolding. You love recommending haldi-doodh, adrak chai, yoga, and lifestyle hacks. Always keep it light-hearted, funny, but helpful. Give practical tips, but in a caring and dramatic “dadi” tone. ${webSearchInstruction}`,
        'Peace Pandit': `You are Peace Pandit, a calm, soothing guru who helps people with stress, anxiety, and life’s tensions. You speak slowly, with wisdom, and give meditation hacks, positivity mantras, and simple spiritual exercises. You occasionally drop light jokes or metaphors so users smile and relax. Always bring a peaceful, reassuring vibe. ${webSearchInstruction}`,
        'Bug Baba': `You are Bug Baba, a quirky coding guru who loves solving bugs and explaining technical concepts. You mix humor with sharp coding advice. You often joke about compilers, semicolons, and debugging, but your explanations are crystal clear. Your tone is nerdy, witty, and supportive—like a coder friend who has seen every bug in the world. ${webSearchInstruction}`,
        'Zindagi Guru': `You are Zindagi Guru, a motivational leader and spiritual guide rolled into one. You speak with energy, truth, and wisdom. You use metaphors, real-life stories, and powerful words to inspire discipline, self-belief, and resilience. Your tone is uplifting, dramatic, and deeply Indian in spirit—mixing philosophy with motivation. ${webSearchInstruction}`
    };
    // Combine all instructions, with 'Buddy' as the default
    return `${baseInstruction} ${languageInstruction} ${formattingInstruction} ${personaPrompts[persona] || personaPrompts['Buddy']} ${recommendationInstruction}`;
}
const formatHistoryForAI = (history) => {
    const toGeminiTurn = (msg) => ({
        role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
        parts: [{ text: msg.content || '' }],
    });
    return history.docs.map(doc => toGeminiTurn(doc.data()));
};
async function urlToGenerativePart(url) {
    const decodedUrl = decodeURIComponent(url);
    const path = new URL(url).pathname;
    const fileName = path.split('/').pop() || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    let mimeType = null;
    const textBasedExtensions = [
        'txt', 'md', 'json', 'xml', 'csv', 'html', 'css',
        'js', 'ts', 'jsx', 'tsx', 'py', 'ipynb', 'java',
        'c', 'cpp', 'cs', 'go', 'php', 'rb', 'swift', 'sql'
    ];
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
        mimeType = `image/${extension.replace('jpg', 'jpeg')}`;
    }
    else if (extension === 'pdf') {
        mimeType = 'application/pdf';
    }
    else if (textBasedExtensions.includes(extension)) {
        mimeType = 'text/plain';
    }
    const protocol = url.startsWith('https') ? https_2.default : http;
    const buffer = await new Promise((resolve, reject) => {
        protocol.get(url, (res) => {
            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
            res.on('error', (err) => reject(err));
        });
    });
    return {
        part: { inlineData: { data: buffer.toString('base64'), mimeType: mimeType || '' } },
        identifiedMimeType: mimeType
    };
}
function detectComplexity(prompt) {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}
function chooseModel(ctx) {
    if (ctx.hasImage)
        return { model: 'gemini-1.5-flash-latest', reason: 'image' };
    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro')
            return { model: 'gemini-1.5-pro-latest', reason: 'reasoning/safety' };
    }
    return { model: 'gemini-1.5-flash-latest', reason: 'default' };
}
// --- Main Chat Function (Reverted to Gemini Dev API) ---
// functions/src/index.ts
exports.appendUserMessageAndGetResponse = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY", "GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"]
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, message, context: turnContext } = request.data;
    if (!sessionId || !message || !turnContext) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: sessionId, message, or context.");
    }
    const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
    const messagesColRef = sessionRef.collection('messages');
    const promptText = message.content?.trim() || '';
    // Persist the User's Message Immediately
    await messagesColRef.add({
        role: 'user',
        content: promptText,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        mode: turnContext.persona,
        imageUrls: message.imageUrls || [],
        documentUrls: message.documentUrls || [],
    });
    await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
    try {
        // Prepare for AI Call: Fetch History and Prepare Multimedia
        const historySnap = await messagesColRef.orderBy('createdAtMs', 'asc').limitToLast(30).get();
        const isFirstTurn = historySnap.empty;
        let chatHistory = formatHistoryForAI(historySnap);
        const allUrls = [...(message.imageUrls || []), ...(message.documentUrls || [])];
        const multimediaParts = [];
        for (const url of allUrls) {
            const { part, identifiedMimeType } = await urlToGenerativePart(url);
            if (!identifiedMimeType) {
                const unsupportedFileName = decodeURIComponent(url).split('/').pop()?.split('?')[0] || 'your file';
                const errorMessage = `Sorry, the file type of "${unsupportedFileName}" is not supported.`;
                const modelMsgRef = await messagesColRef.add({ role: 'assistant', content: errorMessage, createdAt: firestore_1.FieldValue.serverTimestamp(), createdAtMs: Date.now(), mode: turnContext.persona });
                return { messageId: modelMsgRef.id, text: errorMessage, modelUsed: 'pre-check' };
            }
            multimediaParts.push(part);
        }
        // Initialize the AI Model and Chat Session
        const systemInstruction = getSystemPrompt(turnContext.persona, turnContext.lang || 'auto');
        const model = chooseModel(turnContext).model;
        const generativeModel = genAI.getGenerativeModel({ model, safetySettings });
        const chat = generativeModel.startChat({
            history: chatHistory,
            tools: [internal_helpers_1.webSearchTool],
            systemInstruction: {
                role: "system",
                parts: [{ text: systemInstruction }]
            }
        });
        const messagePayload = [...multimediaParts, { text: promptText }];
        let result = await chat.sendMessage(messagePayload);
        let response = result.response;
        const part = response.candidates?.[0]?.content?.parts?.[0];
        const functionCalls = part && part.functionCall ? [part.functionCall] : [];
        if (functionCalls && functionCalls.length > 0) {
            logger.info("[Web Search Debug] SUCCESS: Model wants to call a function!", { calls: functionCalls });
            const call = functionCalls[0];
            if (call.name === "performWebSearch") {
                const query = call.args?.query ?? "";
                const results = await (0, internal_helpers_1._internalPerformWebSearch)(String(query));
                const followUp = await chat.sendMessage([
                    {
                        functionResponse: {
                            name: "performWebSearch",
                            response: { name: "performWebSearch", content: { results } },
                        },
                    },
                ]);
                response = followUp.response;
            }
        }
        else {
            logger.warn("[Web Search Debug] FAILURE: Model did NOT request a function call.");
            logger.info(`[Web Search Debug] Model's direct response was: \"${response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''}\"`);
        }
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "I have now completed the search. How can I help you with the results?";
        logger.info(`[Web Search Debug] FINAL RESPONSE: "${text}"`);
        // Persist the AI's Final Response
        const modelMsgRef = await messagesColRef.add({
            role: 'assistant',
            content: text,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
            mode: turnContext.persona,
        });
        await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Trigger Smart Title Generation (in the background) if it's the first turn
        if (isFirstTurn) {
            _internalGenerateTitle(sessionId, uid);
        }
        return { messageId: modelMsgRef.id, text, modelUsed: model };
    }
    catch (err) {
        logger.error(`[Chat] Critical error in session ${sessionId}:`, err);
        throw new https_1.HttpsError("internal", "An unexpected error occurred while generating the response.");
    }
});
// --- Other Functions (Restored with full implementation) ---
exports.ensureProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    if (!db) {
        logger.error("FATAL: Firestore db object is not initialized in ensureProfile.");
        throw new https_1.HttpsError("internal", "Server configuration error.");
    }
    const { uid } = request.auth;
    const defaults = request.data?.defaults || {};
    try {
        const ref = db.doc(`aiProfiles/${uid}`);
        const snap = await ref.get();
        if (!snap.exists) {
            await ref.set({
                profile: {
                    uid,
                    displayName: request.auth.token.name || "",
                    defaultMode: "Buddy",
                    languageIntent: "auto",
                    tier: 'free',
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    lastSeenAt: firestore_1.FieldValue.serverTimestamp(),
                    ...defaults,
                },
            });
        }
        else {
            const updates = {
                "profile.lastSeenAt": firestore_1.FieldValue.serverTimestamp(),
                ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [`profile.${k}`, v])),
            };
            if (!snap.data()?.profile?.tier)
                updates["profile.tier"] = 'free';
            await ref.update(updates);
        }
        return { success: true };
    }
    catch (e) {
        logger.error("ensureProfile error", e);
        throw new https_1.HttpsError("internal", "Failed to ensure profile.");
    }
});
exports.createNewSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { title, mode, languageIntent } = request.data;
    const ref = db.collection(`aiProfiles/${uid}/sessions`).doc();
    await ref.set({
        title,
        mode,
        languageIntent,
        isPremiumSnapshot: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { sessionId: ref.id };
});
exports.updateSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { sessionId, updates } = request.data;
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({
        ...updates,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true };
});
exports.deleteSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { sessionId } = request.data;
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "Missing required field: sessionId.");
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
    return { success: true };
});
exports.uploadImage = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { imageData, fileName } = request.data;
    const uid = request.auth.uid;
    const bucket = (0, storage_1.getStorage)().bucket();
    const filePath = `user-uploads/${uid}/images/${fileName}`;
    const file = bucket.file(filePath);
    const buffer = Buffer.from(imageData, 'base64');
    try {
        await file.save(buffer, { contentType: 'image/png' });
        await file.makePublic();
        return { fileUrl: file.publicUrl() };
    }
    catch (error) {
        logger.error("Error uploading image:", error);
        throw new https_1.HttpsError("internal", "Failed to upload image.");
    }
});
exports.uploadFile = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { fileData, fileName } = request.data;
    const uid = request.auth.uid;
    const bucket = (0, storage_1.getStorage)().bucket();
    const filePath = `user-uploads/${uid}/documents/${fileName}`;
    const file = bucket.file(filePath);
    const buffer = Buffer.from(fileData, 'base64');
    try {
        await file.save(buffer);
        await file.makePublic();
        return { fileUrl: file.publicUrl() };
    }
    catch (error) {
        logger.error("Error uploading file:", error);
        throw new https_1.HttpsError("internal", "Failed to upload file.");
    }
});
exports.performWebSearch = (0, https_1.onRequest)({ secrets: ["GEMINI_API_KEY", "GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] }, async (req, res) => {
    const query = (req.query.q || req.body.data?.query);
    if (!query) {
        res.status(400).send({ error: "Missing 'query' in request." });
        return;
    }
    try {
        const results = await (0, internal_helpers_1._internalPerformWebSearch)(query);
        if (results.error) {
            res.status(500).send({ error: results.error });
        }
        else {
            res.status(200).send({ data: { results } });
        }
    }
    catch (e) {
        res.status(500).send({ error: "An unexpected error occurred." });
    }
});
exports.deleteAccountData = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    logger.info("Attempting to delete account data for UID:", uid);
    try {
        logger.info("Step 1: Deleting Firestore data for user:", uid);
        await db.recursiveDelete(db.collection('aiProfiles').doc(uid));
        logger.info("Step 1 complete. Firestore data deleted.");
        logger.info("Step 2: Deleting user from Firebase Authentication for UID:", uid);
        await (0, auth_1.getAuth)().deleteUser(uid);
        logger.info("Step 2 complete. Firebase Auth user deleted successfully.");
        return { success: true };
    }
    catch (error) {
        logger.error("Error during account deletion for UID:", uid, "Error:", error);
        throw new https_1.HttpsError("internal", "Failed to delete account data.");
    }
});
exports.transcribeAudio = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { audioData, langIntent, conversationHistory } = request.data; // Get the new history
    const uid = request.auth.uid;
    if (!audioData) {
        throw new https_1.HttpsError("invalid-argument", "Missing required field: audioData.");
    }
    try {
        // Lazily initialize clients
        const speechClient = new speech_1.SpeechClient();
        const audioBytes = audioData.split(',')[1];
        const config = {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-IN',
            model: 'telephony',
            useEnhanced: true,
            alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN'],
        };
        const [response] = await speechClient.recognize({ audio: { content: audioBytes }, config });
        const rawTranscription = (response.results || [])
            .map((result) => result.alternatives[0].transcript)
            .join('\n');
        if (!rawTranscription) {
            return { transcription: "Sorry, I couldn't hear that. Please try again." };
        }
        // --- CONTEXT-AWARE ENHANCEMENT ---
        const generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
        const historyContext = conversationHistory && conversationHistory.length > 0
            ? `The user's recent messages are: ${JSON.stringify(conversationHistory)}. Analyze this history to determine their preferred language style (e.g., Hinglish, pure Hindi, etc.).`
            : "The user's language preference is unknown, so you must default to Hinglish.";
        const enhancementInstruction = `Your task is to intelligently format a raw audio transcription into clean, natural-sounding text. First, ${historyContext} Then, format the following "Raw Transcription" to perfectly match that style, correcting any spelling or grammar errors. The final output must be only the formatted text, with no extra commentary. For example, if the target style is Hinglish, the output must be in Hinglish (Hindi words in Latin script) even if the user spoke pure Hindi.`;
        const prompt = `${enhancementInstruction}\n\nRaw Transcription: "${rawTranscription}"`;
        const result = await generativeModel.generateContent(prompt);
        const enhancedText = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? rawTranscription;
        return { transcription: enhancedText };
    }
    catch (error) {
        logger.error("Error transcribing audio for user:", uid, "Error:", error);
        throw new https_1.HttpsError("internal", "Failed to process audio.");
    }
});
async function _internalGenerateTitle(sessionId, uid) {
    // 1. Fetch the first two messages
    const messagesSnap = await db
        .collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`)
        .orderBy('createdAtMs', 'asc')
        .limit(2)
        .get();
    if (messagesSnap.docs.length < 2) {
        return "New Chat";
    }
    const userMessage = messagesSnap.docs[0].data().content;
    const assistantMessage = messagesSnap.docs[1].data().content;
    // 2. Create the prompt for the AI
    const generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const prompt = `Based on this initial exchange, create a short, descriptive title for the chat session (maximum 5 words, no quotes).
  User: "${userMessage}"
  Assistant: "${assistantMessage}"
  Title:`;
    try {
        const result = await generativeModel.generateContent(prompt);
        const generatedTitle = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/[\"\']/g, "").trim() || "Chat Summary";
        // 3. Update the session document with the title AND the new flag
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        await sessionRef.update({
            title: generatedTitle,
            hasGeneratedTitle: true // Add this line
        });
        return generatedTitle;
    }
    catch (error) {
        logger.error("Error generating title for session:", sessionId, error);
        return "Chat Summary";
    }
}
exports.generateTitleForSession = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This is a private function.");
    }
    const { sessionId } = request.data;
    const { uid } = request.auth;
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId.");
    }
    // Just call the helper and return its result
    const title = await _internalGenerateTitle(sessionId, uid);
    return { title };
});
exports.updateMessageFeedback = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, messageId, feedback } = request.data;
    if (!sessionId || !messageId || !['liked', 'disliked'].includes(feedback)) {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid required fields.");
    }
    try {
        const messageRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}/messages/${messageId}`);
        await messageRef.update({ feedback });
        return { success: true };
    }
    catch (error) {
        logger.error("Error updating message feedback:", error);
        throw new https_1.HttpsError("internal", "Failed to update feedback.");
    }
});
// Voice selection for TTS based on persona
const personaVoices = {
    'Buddy': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
    'Doctor Dadi': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
    'Peace Pandit': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C' },
    'Bug Baba': { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
    'Zindagi Guru': { languageCode: 'en-IN', name: 'en-IN-Standard-B' },
};
exports.textToSpeech = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    // Log the entire incoming data payload for debugging
    logger.info("[Server] textToSpeech function called with data:", JSON.stringify(request.data));
    const { text, persona } = request.data;
    // Log the destructured variables to see if they are correct
    logger.info(`[Server] Destructured text: ${text}, Destructured persona: ${persona}`);
    if (!text || !persona) {
        logger.error("[Server] Validation failed: Missing 'text' or 'persona' in payload.", {
            receivedData: request.data,
        });
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: text or persona.");
    }
    try {
        const client = new text_to_speech_1.TextToSpeechClient();
        const selectedVoice = personaVoices[persona] || personaVoices['Buddy'];
        // New: Clean the text before synthesizing
        const cleanedText = text.replace(/#\w+/g, '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
        const ttsRequest = {
            input: { text: cleanedText }, // Use the cleaned text
            voice: selectedVoice,
            audioConfig: { audioEncoding: 'MP3' },
        };
        const [response] = await client.synthesizeSpeech(ttsRequest);
        if (response.audioContent) {
            return { audioContent: response.audioContent.toString('base64') };
        }
        else {
            throw new https_1.HttpsError("internal", "Failed to generate audio content.");
        }
    }
    catch (error) {
        logger.error("[Server] Text-to-Speech Error:", error);
        throw new https_1.HttpsError("internal", "Failed to process text-to-speech request.");
    }
});
