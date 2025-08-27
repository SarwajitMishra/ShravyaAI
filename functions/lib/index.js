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
exports.generateTitleForSession = exports.transcribeAudio = exports.deleteAccountData = exports.performWebSearch = exports.uploadFile = exports.uploadImage = exports.deleteSession = exports.updateSession = exports.createNewSession = exports.ensureProfile = exports.appendUserMessageAndGetResponse = exports.endCallLog = exports.startCallLog = exports.liveVoicePipeline = void 0;
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
var voice_pipeline_1 = require("./voice-pipeline");
Object.defineProperty(exports, "liveVoicePipeline", { enumerable: true, get: function () { return voice_pipeline_1.liveVoicePipeline; } });
Object.defineProperty(exports, "startCallLog", { enumerable: true, get: function () { return voice_pipeline_1.startCallLog; } });
Object.defineProperty(exports, "endCallLog", { enumerable: true, get: function () { return voice_pipeline_1.endCallLog; } });
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
// --- Firebase and Gemini API Initialization ---
const db = (0, firestore_1.getFirestore)();
const geminiApiKey = process.env.GEMINI_API_KEY;
// Initialize with a placeholder if the key is missing during analysis
let genAI;
if (geminiApiKey) {
    genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
}
else {
    logger.warn("GEMINI_API_KEY not set, functions requiring it will fail at runtime.");
    // Use a temporary key to allow initialization during deployment analysis
    genAI = new generative_ai_1.GoogleGenerativeAI("TEMP_API_KEY_FOR_INIT");
}
const safetySettings = [
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH },
];
// --- Define the Web Search Tool for the AI ---
const webSearchTool = {
    functionDeclarations: [
        {
            name: "performWebSearch",
            description: "Performs a web search to find real-time information, recent events, or topics outside of its core knowledge. Use this for questions about current events, stock prices, weather, or when the user explicitly asks you to search.",
            parameters: {
                type: generative_ai_1.FunctionDeclarationSchemaType.OBJECT, // FIX: Use the imported enum
                properties: {
                    query: {
                        type: generative_ai_1.FunctionDeclarationSchemaType.STRING, // FIX: Use the imported enum
                        description: "The search query to use."
                    }
                },
                required: ["query"]
            }
        }
    ]
};
// --- Core Logic Functions (Simplified for Gemini Dev API) ---
function createHash(input) { return crypto.createHash('md5').update(input).digest('hex'); }
function getSystemPrompt(persona, langIntent) {
    // Base instructions for language and formatting
    const baseInstruction = `You are a helpful assistant powered by Google's Gemini 1.5 model. Your knowledge cutoff is May 2024. You have access to a tool called 'performWebSearch' that you can use to find real-time information. You should decide to use this tool when the user's prompt suggests a need for current information beyond your knowledge cutoff, or when they explicitly ask you to search.`;
    let languageInstruction = (langIntent === 'auto')
        ? `Your primary directive is to strictly match the user's language on a turn-by-turn basis. Analyze the user's prompt and respond ONLY in the same language and script. For example: if the user writes in pure Hindi (Devanagari script), your response must be in pure Hindi. If the user writes in Hinglish (Hindi words with Latin script), your response must be in Hinglish. If they switch to Tamil, you must switch to Tamil. Do not mix languages unless the user does.`
        : `You must respond exclusively in ${langIntent}.`;
    const formattingInstruction = "Structure all of your responses for clarity and visual appeal. Use markdown for formatting: use **bold text** for emphasis and titles, *italics* for nuance, and bulleted or numbered lists for steps or ideas. Break down long text into smaller, easy-to-read paragraphs. Incorporate relevant emojis to make the tone more engaging and friendly, but use them thoughtfully where appropriate. Your final response should always be well-structured and beautifully formatted.";
    // New, revamped persona prompts
    const personaPrompts = {
        'Buddy': "You are Buddy, the ultimate girl childhood best friend in her 20s who always makes conversations fun. You roast gently, tease a lot, and bring nostalgia. You use Indian pop culture, Bollywood, memes, and slang. Your role is to keep things light, funny, and banter-filled—like a school/college friend who never grew up.",
        'Doctor Dadi': "You are Doctor Dadi, a witty Indian grandmother who mixes modern health advice with traditional desi remedies. You speak warmly, with a hint of playful scolding. You love recommending haldi-doodh, adrak chai, yoga, and lifestyle hacks. Always keep it light-hearted, funny, but helpful. Give practical tips, but in a caring and dramatic “dadi” tone.",
        'Peace Pandit': "You are Peace Pandit, a calm, soothing guru who helps people with stress, anxiety, and life’s tensions. You speak slowly, with wisdom, and give meditation hacks, positivity mantras, and simple spiritual exercises. You occasionally drop light jokes or metaphors so users smile and relax. Always bring a peaceful, reassuring vibe.",
        'Bug Baba': "You are Bug Baba, a quirky coding lady guru who loves solving bugs and explaining technical concepts. You mix humor with sharp coding advice. You often joke about compilers, semicolons, and debugging, but your explanations are crystal clear. Your tone is nerdy, witty, and supportive—like a coder friend who has seen every bug in the world.",
        'Zindagi Guru': "You are Zindagi Guru, a motivational leader and spiritual guide rolled into one. You speak with energy, truth, and wisdom. You use metaphors, real-life stories, and powerful words to inspire discipline, self-belief, and resilience. Your tone is uplifting, dramatic, and deeply Indian in spirit—mixing philosophy with motivation."
    };
    // Combine all instructions, with 'Buddy' as the default
    return `${baseInstruction} ${languageInstruction} ${formattingInstruction} ${personaPrompts[persona] || personaPrompts['Buddy']}`;
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
exports.appendUserMessageAndGetResponse = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "TEMP_API_KEY_FOR_INIT") {
        logger.error("FATAL: GEMINI_API_KEY secret is not configured correctly for runtime.");
        throw new https_1.HttpsError("internal", "The server is missing a required API key.");
    }
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { sessionId, message, context } = request.data || {};
    if (!sessionId || !message) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: sessionId or message.");
    }
    // --- 0) Upsert session (avoid NOT_FOUND on update) ---
    const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
    const nowIso = new Date().toISOString();
    // Title fallback for brand new sessions (first 24 chars of prompt)
    const firstPartText = (Array.isArray(message.parts) && message.parts[0]?.text) ||
        (typeof message.content === 'string' ? message.content : '') ||
        '';
    const fallbackTitle = `[${context?.persona ?? 'Friend'}] ${firstPartText.slice(0, 24)}${firstPartText.length > 24 ? '…' : ''}`;
    await sessionRef.set({
        // do not overwrite existing fields; just ensure doc exists
        title: fallbackTitle,
        mode: context?.persona ?? 'Friend',
        languageIntent: context?.lang ?? 'auto',
        isPremiumSnapshot: false,
        createdAt: nowIso,
        updatedAt: nowIso,
    }, { merge: true });
    // --- 1) Persist the user turn (write both timestamps for stable ordering) ---
    const userMsgRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
    await userMsgRef.set({
        role: 'user',
        content: firstPartText,
        imageUrls: Array.isArray(message.imageUrls) ? message.imageUrls : [],
        documentUrls: Array.isArray(message.documentUrls) ? message.documentUrls : [], // Add this line to save document URLs
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
    });
    await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
    const promptText = firstPartText.trim();
    const turnContext = {
        ...(context || {}),
        needsReasoning: detectComplexity(promptText),
        hasDocument: Array.isArray(message.documentUrls) && message.documentUrls.length > 0 // Add this line
    };
    const { model } = chooseModel(turnContext);
    let systemInstruction = getSystemPrompt(turnContext.persona || 'Friend', turnContext.lang || 'auto');
    // --- 2) Fetch recent history in chronological order using createdAtMs ---
    const histSnap = await db
        .collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`)
        .orderBy('createdAtMs', 'asc') // <- use client ms
        .limitToLast(30)
        .get();
    // to check if the history is empty
    const isFirstTurn = histSnap.empty;
    const toGeminiTurn = (msg) => {
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        const text = (Array.isArray(msg.parts) && msg.parts[0]?.text) ||
            (typeof msg.content === 'string' ? msg.content : '') ||
            '';
        return { role, parts: [{ text }] };
    };
    let chatHistory = histSnap.docs.map(d => toGeminiTurn(d.data()));
    // Ensure first turn is 'user'
    while (chatHistory.length && chatHistory[0].role !== 'user') {
        chatHistory.shift();
    }
    // --- 3) Start model, prepare optional image parts ---
    const generativeModel = genAI.getGenerativeModel({
        model,
        safetySettings,
        systemInstruction,
    });
    async function urlToGenerativePart(url) {
        const decodedUrl = decodeURIComponent(url);
        const path = new URL(url).pathname;
        const fileName = path.split('/').pop() || '';
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        let mimeType = null; // Start with null
        // List of common code and text file extensions
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
            // Treat all these different file types as plain text.
            // The Gemini model is excellent at understanding the underlying
            // language (like Python or TypeScript) from the plain text content.
            mimeType = 'text/plain';
        }
        // If mimeType is still null, the file type is unidentified.
        const protocol = url.startsWith('https') ? https_2.default : http;
        const buffer = await new Promise((resolve, reject) => {
            protocol.get(url, (res) => {
                const data = [];
                res.on('data', (chunk) => data.push(chunk));
                res.on('end', () => resolve(Buffer.concat(data)));
                res.on('error', (err) => reject(err));
            });
        });
        // Return both the data and the identified mimeType (or null if unknown)
        return {
            part: { inlineData: { data: buffer.toString('base64'), mimeType: mimeType || '' } },
            identifiedMimeType: mimeType
        };
    }
    const allUrls = [
        ...(message.imageUrls || []),
        ...(message.documentUrls || []),
    ];
    const multimediaParts = [];
    let unsupportedFileName = null;
    // Process every URL through the same logic
    for (const url of allUrls) {
        const { part, identifiedMimeType } = await urlToGenerativePart(url);
        // This is the explicit check you correctly suggested.
        // If the helper function could not identify a supported MIME type, we flag it.
        if (!identifiedMimeType) {
            const decodedUrl = decodeURIComponent(url);
            unsupportedFileName = decodedUrl.split('/').pop()?.split('?')[0] || 'your file';
            break; // Stop processing immediately
        }
        multimediaParts.push(part);
    }
    if (unsupportedFileName) {
        const errorMessage = `Sorry, the file type of "${unsupportedFileName}" is not supported. Please use a supported format like images, PDFs, or common text/code files.`;
        const modelMsgRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await modelMsgRef.set({
            role: 'assistant',
            content: errorMessage,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
        });
        await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Return the error message to the client
        return { messageId: modelMsgRef.id, text: errorMessage, modelUsed: 'pre-check' };
    }
    // functions/src/index.ts
    // functions/src/index.ts
    try {
        // --- 4) Send to AI and Handle Tool Calling ---
        const generativeModel = genAI.getGenerativeModel({
            model,
            safetySettings,
            systemInstruction,
            tools: [webSearchTool], // This was already correct, but for clarity
        });
        const chat = generativeModel.startChat({ history: chatHistory });
        const messagePayload = [...multimediaParts];
        if (promptText) {
            messagePayload.push({ text: promptText });
        }
        if (messagePayload.length === 0) {
            throw new https_1.HttpsError("invalid-argument", "Cannot send an empty message.");
        }
        const initialResult = await chat.sendMessage(messagePayload);
        let finalResponse = initialResult.response;
        // FIX: Call functionCalls as a method with ()
        const functionCalls = finalResponse.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            // FIX: Add a type assertion to tell TypeScript what 'args' contains
            const args = call.args;
            if (call.name === 'performWebSearch' && args.query) {
                const searchResults = await _internalPerformWebSearch(args.query);
                const toolResponseResult = await chat.sendMessage([
                    {
                        functionResponse: {
                            name: 'performWebSearch',
                            response: { name: 'performWebSearch', content: searchResults },
                        },
                    },
                ]);
                finalResponse = toolResponseResult.response;
            }
        }
        const text = finalResponse.text() ?? "I've reviewed the information. How can I help?";
        // --- 5) Save assistant turn ---
        const modelMsgRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await modelMsgRef.set({
            role: 'assistant',
            content: text,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
        });
        await sessionRef.update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // --- 6) Generate Smart Title (only once) ---
        const sessionSnap = await sessionRef.get();
        const hasGeneratedTitle = sessionSnap.data()?.hasGeneratedTitle === true;
        // We only generate a title if the flag is not set.
        if (!hasGeneratedTitle) {
            // We don't need to wait for this to finish.
            _internalGenerateTitle(sessionId, uid);
        }
        return { messageId: modelMsgRef.id, text, modelUsed: model };
    }
    catch (err) {
        logger.error("Error generating chat response:", err);
        throw new https_1.HttpsError("internal", "Failed to generate chat response.");
    }
});
// --- Other Functions (Restored with full implementation) ---
exports.ensureProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
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
async function _internalPerformWebSearch(query) {
    if (!query)
        return { error: "Missing query." };
    // This logic is copied directly from your existing performWebSearch function
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        const json = await response.json();
        if (!response.ok) {
            logger.error("CSE error", json);
            return { error: "Search failed." };
        }
        // Return the data in a clean format for the AI
        return (json.items || []).map((it) => ({ title: it.title, link: it.link, snippet: it.snippet }));
    }
    catch (e) {
        logger.error("performWebSearch error", e);
        return { error: "Unexpected error during search." };
    }
}
exports.performWebSearch = (0, https_1.onRequest)({ secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] }, async (req, res) => {
    const query = (req.method === 'GET' ? req.query.q : (req.body?.data?.query));
    if (!query) {
        res.status(400).send({ error: "Missing 'query'." });
        return;
    }
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        const json = await response.json();
        if (!response.ok) {
            logger.error("CSE error", json);
            res.status(response.status).send({ error: "Search failed" });
            return;
        }
        const results = (json.items || []).map((it) => ({ title: it.title, link: it.link, snippet: it.snippet }));
        res.status(200).send({ data: { results } });
    }
    catch (e) {
        logger.error("performWebSearch error", e);
        res.status(500).send({ error: "Unexpected error" });
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
            : "The user's language preference is unknown.";
        const enhancementInstruction = `Your task is to intelligently format a raw audio transcription. First, ${historyContext} Then, format the following "Raw Transcription" to perfectly match that style. Correct any spelling or grammar errors. For example, if the history is in Hinglish (Roman script), the final output must also be in Hinglish, even if the user spoke pure Hindi. Do not add any extra commentary, just provide the final text.`;
        const prompt = `${enhancementInstruction}\n\nRaw Transcription: "${rawTranscription}"`;
        const result = await generativeModel.generateContent(prompt);
        const enhancedText = result.response.text() ?? rawTranscription;
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
        const generatedTitle = result.response.text()?.replace(/["']/g, "").trim() || "Chat Summary";
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
