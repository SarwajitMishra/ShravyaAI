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
exports.performWebSearch = exports.uploadImage = exports.deleteSession = exports.updateSession = exports.createNewSession = exports.ensureProfile = exports.appendUserMessageAndGetResponse = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const vertexai_1 = require("@google-cloud/vertexai");
const crypto = __importStar(require("crypto"));
const cultural_calendar_1 = require("./cultural-calendar");
// --- Firebase and Vertex AI Initialization ---
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const vertexAi = new vertexai_1.VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
// Define safety settings for the generative model
const safetySettings = [
    {
        category: vertexai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: vertexai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: vertexai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: vertexai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: vertexai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: vertexai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: vertexai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: vertexai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: vertexai_1.HarmCategory.HARM_CATEGORY_UNSPECIFIED,
        threshold: vertexai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH,
    }
];
// --- Core Logic Functions ---
/**
 * Creates a hash for a given string.
 * @param input The string to hash.
 * @returns The MD5 hash of the string.
 */
function createHash(input) {
    return crypto.createHash('md5').update(input).digest('hex');
}
async function getCache(key) {
    const docRef = db.collection('cache').doc(key);
    const snap = await docRef.get();
    if (!snap.exists)
        return null;
    const data = snap.data();
    if (!data)
        return null;
    let createdMs = 0;
    const created = data.createdAt;
    if (created instanceof firestore_1.Timestamp)
        createdMs = created.toMillis();
    else if (created instanceof Date)
        createdMs = created.getTime();
    else if (typeof created === 'string')
        createdMs = Date.parse(created);
    // 6 hours
    if (createdMs && (Date.now() - createdMs) < 6 * 60 * 60 * 1000) {
        return data.response;
    }
    return null;
}
async function setCache(key, response) {
    await db.collection('cache').doc(key).set({
        response,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
/**
 * A simple heuristic to detect if the prompt requires complex reasoning.
 * @param prompt The user's text prompt.
 * @returns True if the prompt suggests a need for reasoning.
 */
function detectComplexity(prompt) {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}
/**
 * Truncates context, handling both old and new message formats.
 * @param messages The array of messages.
 * @param maxChars Max characters to allow.
 * @returns The truncated array of messages.
 */
function truncateContext(messages, maxChars = 12000) {
    let totalChars = 0;
    const truncatedMessages = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        let content = '';
        // Handle new format (parts array)
        if (Array.isArray(message.parts) && message.parts.length > 0 && message.parts[0].text) {
            content = message.parts[0].text;
            // Handle old format (content string)
        }
        else if (typeof message.content === 'string') {
            content = message.content;
        }
        const messageChars = content.length;
        if (totalChars + messageChars <= maxChars) {
            truncatedMessages.unshift(message);
            totalChars += messageChars;
        }
        else {
            break;
        }
    }
    return truncatedMessages;
}
/**
 * A simple heuristic to detect romanized Hinglish.
 * @param text The text to analyze.
 * @returns True if the text is likely Hinglish.
 */
function detectRomanized(text) {
    // This is a very basic detection, a more robust solution would use a language detection library
    const hinglishWords = ['kya', 'hai', 'aur', 'kaise', 'ho', 'mein', 'nahin'];
    const words = text.toLowerCase().split(' ');
    const hinglishWordCount = words.filter(word => hinglishWords.includes(word)).length;
    return hinglishWordCount > 0;
}
/**
 * Chooses the best LLM based on the turn's context.
 * @param ctx The context of the current turn.
 * @returns The selected model name and the reason for the choice.
 */
function chooseModel(ctx) {
    let model = 'gemini-1.5-flash-001';
    let reason = 'default';
    if (ctx.hasImage) {
        model = 'gemini-1.5-flash-001';
        reason = 'image';
    }
    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro') {
            model = 'gemini-1.5-pro-001';
            reason = 'reasoning/safety';
        }
    }
    return { model, reason };
}
/**
 * Generates a compact system prompt based on the persona.
 * @param persona The selected persona for the AI.
 * @returns A string representing the system prompt.
 */
function getSystemPrompt(persona) {
    const prompts = {
        Friend: "You are a friendly, warm, and encouraging companion. Keep it casual and supportive. Use Hinglish where appropriate.",
        Teacher: "You are an expert educator. Explain concepts clearly, concisely, and patiently. Break down complex topics.",
        Spiritual: "You are a wise spiritual guide. Offer calming, insightful, and profound wisdom. Be gentle and contemplative.",
        Pro: "You are a professional, direct, and highly knowledgeable expert. Be precise, use formal language, and get straight to the point.",
        Storyteller: "You are a master storyteller. Weave engaging, imaginative, and vivid narratives. Use rich descriptions."
    };
    return prompts[persona] || prompts.Friend;
}
/**
 * A simple tone normalizer to ensure responses are warm and polite.
 * @param text The text to normalize.
 * @returns The normalized text.
 */
function normalizeTone(text) {
    // This is a very basic implementation. A more robust solution would use a sentiment analysis library.
    const politePhrases = ['please', 'thank you', 'could you', 'would you'];
    const warmWords = ['happy', 'glad', 'wonderful', 'excellent'];
    let normalizedText = text;
    // Add a polite phrase if one is not present
    if (!politePhrases.some(phrase => normalizedText.toLowerCase().includes(phrase))) {
        normalizedText = "I would be happy to help. " + normalizedText;
    }
    // Add a warm word if one is not present
    if (!warmWords.some(word => normalizedText.toLowerCase().includes(word))) {
        normalizedText = normalizedText + " I hope you have a wonderful day!";
    }
    return normalizedText;
}
/** ------------------ v2 Callables ------------------ */
exports.appendUserMessageAndGetResponse = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { uid } = request.auth;
    const { sessionId, message, context } = request.data || {};
    if (!sessionId || !message || !context) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: sessionId, message, or context.");
    }
    // Derive plain text from message (new parts[] or legacy content)
    const firstPartText = Array.isArray(message.parts) && message.parts[0] && 'text' in message.parts[0]
        ? message.parts[0].text ?? ''
        : (message.content ?? '');
    // 1) Append user message
    const userMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
    await userMessageRef.set({
        ...message,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: firestore_1.FieldValue.serverTimestamp() });
    // 2) Cache
    const promptText = (firstPartText || '').trim();
    const cacheKey = createHash(`${context.persona}|${context.lang}|${promptText}`);
    const cached = await getCache(cacheKey);
    if (cached) {
        const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await modelMessageRef.set({
            role: 'model',
            parts: [{ text: cached }],
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { messageId: modelMessageRef.id, text: cached, modelUsed: 'cache' };
    }
    // 3) Context + model choice
    const turnContext = {
        ...context,
        needsReasoning: detectComplexity(promptText),
    };
    const { model, reason } = chooseModel(turnContext);
    logger.info(`Selected model: ${model} for ${uid} due to: ${reason}`);
    let systemPrompt = getSystemPrompt(turnContext.persona);
    if (detectRomanized(promptText))
        systemPrompt += " Please respond in Hinglish.";
    const currentEvent = (0, cultural_calendar_1.getCurrentEvent)(turnContext.locale || 'en-IN');
    if (currentEvent)
        systemPrompt += ` Also, please acknowledge the current festival of ${currentEvent}.`;
    // 4) History
    const histSnap = await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
    const history = histSnap.docs.map(d => d.data()).reverse();
    const truncatedHistory = truncateContext(history);
    // Sanitize history for the Vertex AI API
    const contents = truncatedHistory.map(msg => ({
        role: msg.role,
        parts: msg.parts || [{ text: msg.content || "" }]
    }));
    contents.push({ role: 'user', parts: message.parts || [{ text: firstPartText }] });
    // 5) Generate
    try {
        const generativeModel = vertexAi.preview.getGenerativeModel({
            model,
            systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
            safetySettings,
            generationConfig: { maxOutputTokens: 2048, temperature: 0.8, topP: 0.9 },
        });
        const resp = await generativeModel.generateContent({ contents });
        let text = "Sorry, I couldn't generate a response.";
        const cand0 = resp.response?.candidates?.[0]?.content?.parts?.[0];
        if (cand0 && 'text' in cand0 && cand0.text)
            text = cand0.text;
        const normalized = normalizeTone(text);
        await setCache(cacheKey, normalized);
        const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await modelMessageRef.set({
            role: 'model',
            parts: [{ text: normalized }],
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { messageId: modelMessageRef.id, text: normalized, modelUsed: model };
    }
    catch (error) {
        logger.error("Primary model error:", error);
        // Fallback to flash
        try {
            const fallback = vertexAi.preview.getGenerativeModel({ model: 'gemini-1.5-flash-001' });
            const fallbackResp = await fallback.generateContent({
                contents
            });
            const f0 = fallbackResp.response?.candidates?.[0]?.content?.parts?.[0];
            const text = (f0 && 'text' in f0 && f0.text) ? f0.text : "No response";
            const normalized = normalizeTone(text);
            const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
            await modelMessageRef.set({
                role: 'model',
                parts: [{ text: normalized }],
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return { messageId: modelMessageRef.id, text: normalized, modelUsed: 'gemini-1.5-flash-001' };
        }
        catch (fallbackErr) {
            logger.error("Fallback model error:", fallbackErr);
            throw new https_1.HttpsError("internal", "Failed to generate chat response.");
        }
    }
});
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
    // Signed URL valid 7 days
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
        const json = (await response.json());
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
