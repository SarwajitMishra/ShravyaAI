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
exports.deleteAccountData = exports.performWebSearch = exports.uploadImage = exports.deleteSession = exports.updateSession = exports.createNewSession = exports.ensureProfile = exports.appendUserMessageAndGetResponse = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const generative_ai_1 = require("@google/generative-ai");
const crypto = __importStar(require("crypto"));
// --- Firebase and Gemini API Initialization ---
(0, app_1.initializeApp)();
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
// --- Core Logic Functions (Simplified for Gemini Dev API) ---
function createHash(input) { return crypto.createHash('md5').update(input).digest('hex'); }
function detectRomanized(text) { const words = ['kya', 'hai', 'aur', 'kaise', 'ho']; return words.some(w => text.toLowerCase().includes(w)); }
function getSystemPrompt(persona) {
    const prompts = { Friend: "You are a friendly companion.", Teacher: "You are an expert educator.", Pro: "You are a professional expert.", Storyteller: "You are a master storyteller.", Spiritual: "You are a wise spiritual guide." };
    return prompts[persona] || prompts.Friend;
}
function detectComplexity(prompt) {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}
function chooseModel(ctx) {
    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro')
            return { model: 'gemini-1.5-pro-latest', reason: 'reasoning/safety' };
    }
    return { model: 'gemini-1.5-flash-latest', reason: 'default' };
}
// --- Main Chat Function (Reverted to Gemini Dev API) ---
exports.appendUserMessageAndGetResponse = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"] }, // Granting access to the secret
async (request) => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "TEMP_API_KEY_FOR_INIT") {
        logger.error("FATAL: GEMINI_API_KEY secret is not configured correctly for runtime.");
        throw new https_1.HttpsError("internal", "The server is missing a required API key.");
    }
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { sessionId, message, context } = request.data;
    const firstPartText = (Array.isArray(message.parts) && message.parts[0]?.text) || (message.content ?? '');
    await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc().set({ role: 'user', content: firstPartText, createdAt: firestore_1.FieldValue.serverTimestamp() });
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
    const promptText = firstPartText.trim();
    const turnContext = { ...context, needsReasoning: detectComplexity(promptText) };
    const { model } = chooseModel(turnContext);
    let systemInstruction = getSystemPrompt(turnContext.persona);
    if (detectRomanized(promptText))
        systemInstruction += " Please respond in Hinglish.";
    const histSnap = await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).orderBy('createdAt', 'desc').limit(20).get();
    const history = histSnap.docs.map(d => d.data()).reverse();
    const sanitizedHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: msg.parts || [{ text: msg.content || "" }]
    }));
    try {
        const generativeModel = genAI.getGenerativeModel({ model, safetySettings, systemInstruction });
        const chat = generativeModel.startChat({ history: sanitizedHistory });
        const result = await chat.sendMessage(promptText);
        const text = result.response.text();
        const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await modelMessageRef.set({ role: 'assistant', content: text, createdAt: firestore_1.FieldValue.serverTimestamp() });
        return { messageId: modelMessageRef.id, text, modelUsed: model };
    }
    catch (error) {
        logger.error("Error generating chat response:", error);
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
                    defaultMode: "Friend",
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
exports.uploadImage = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { imageData, fileName } = request.data;
    const uid = request.auth.uid;
    const bucket = (0, storage_1.getStorage)().bucket();
    const filePath = `user-uploads/${uid}/images/${fileName}`;
    const file = bucket.file(filePath);
    const buffer = Buffer.from(imageData, 'base64');
    await file.save(buffer, { contentType: 'image/png', resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return { fileUrl: url };
});
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
