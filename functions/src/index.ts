
import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { Readable } from "stream";
import { Request, Response } from "express";
import { GoogleGenerativeAI, Part, Content, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import * as crypto from 'crypto';
import { getCurrentEvent } from './cultural-calendar';

// --- Types ---
type Persona = 'Friend' | 'Teacher' | 'Spiritual' | 'Pro' | 'Storyteller';
type LangIntent = 'auto' | 'hi' | 'en' | 'ta' | 'te' | 'mr' | 'bn' | 'ml' | 'hinglish';
type UserTier = 'free' | 'pro';

interface TurnContext {
    persona: Persona;
    lang: LangIntent;
    hasImage: boolean;
    needsReasoning: boolean;
    safetySensitive: boolean;
    userTier: UserTier;
    locale?: string;
}

interface Message {
    role: 'user' | 'model' | 'assistant'; // Allow assistant for Firestore data
    parts: Part[];
    createdAt?: string | FieldValue;
    content?: string; // For legacy messages
}

// --- Request/Response Shapes ---
interface AppendUserMessageAndGetResponseReq {
  sessionId: string;
  message: Message;
  context: TurnContext;
}
interface AppendUserMessageAndGetResponseRes {
  messageId: string;
  text: string;
  modelUsed: string;
}
interface EnsureProfileReq { defaults?: Partial<{ tier: UserTier; defaultMode: Persona; languageIntent: LangIntent }> }
interface EnsureProfileRes { success: boolean }
interface CreateNewSessionReq { title: string; mode: Persona; languageIntent: LangIntent }
interface CreateNewSessionRes { sessionId: string }
interface UpdateSessionReq { sessionId: string; updates: Record<string, unknown> }
interface UpdateSessionRes { success: boolean }
interface DeleteSessionReq { sessionId: string }
interface DeleteSessionRes { success: boolean }
interface UploadImageReq { imageData: string; fileName: string }
interface UploadImageRes { fileUrl: string }

// --- Firebase and Gemini API Initialization ---
initializeApp();
const db = getFirestore();
const geminiApiKey = process.env.GEMINI_API_KEY;

// Initialize with a placeholder if the key is missing during analysis
let genAI: GoogleGenerativeAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
} else {
    logger.warn("GEMINI_API_KEY not set, functions requiring it will fail at runtime.");
    // Use a temporary key to allow initialization during deployment analysis
    genAI = new GoogleGenerativeAI("TEMP_API_KEY_FOR_INIT");
}


const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- Core Logic Functions (Simplified for Gemini Dev API) ---
function createHash(input: string): string { return crypto.createHash('md5').update(input).digest('hex'); }
function detectRomanized(text: string): boolean { const words = ['kya', 'hai', 'aur', 'kaise', 'ho']; return words.some(w => text.toLowerCase().includes(w)); }
function getSystemPrompt(persona: Persona): string {
    const prompts = { Friend: "You are a friendly companion.", Teacher: "You are an expert educator.", Pro: "You are a professional expert.", Storyteller: "You are a master storyteller.", Spiritual: "You are a wise spiritual guide." };
    return prompts[persona] || prompts.Friend;
}
function detectComplexity(prompt: string): boolean {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}
function chooseModel(ctx: TurnContext): { model: string; reason: string } {
    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro') return { model: 'gemini-1.5-pro-latest', reason: 'reasoning/safety' };
    }
    return { model: 'gemini-1.5-flash-latest', reason: 'default' };
}


// --- Main Chat Function (Reverted to Gemini Dev API) ---
export const appendUserMessageAndGetResponse = onCall<AppendUserMessageAndGetResponseReq, Promise<AppendUserMessageAndGetResponseRes>>(
    { secrets: ["GEMINI_API_KEY"] }, // Granting access to the secret
    async (request) => {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "TEMP_API_KEY_FOR_INIT") {
            logger.error("FATAL: GEMINI_API_KEY secret is not configured correctly for runtime.");
            throw new HttpsError("internal", "The server is missing a required API key.");
        }
        if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");

        const { uid } = request.auth;
        const { sessionId, message, context } = request.data;

        const firstPartText = (Array.isArray(message.parts) && message.parts[0]?.text) || (message.content ?? '');
        
        await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc().set({ role: 'user', content: firstPartText, createdAt: FieldValue.serverTimestamp() });
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: FieldValue.serverTimestamp() });
        
        const promptText = firstPartText.trim();
        const turnContext: TurnContext = { ...context, needsReasoning: detectComplexity(promptText) };
        const { model } = chooseModel(turnContext);
        
        let systemInstruction = getSystemPrompt(turnContext.persona);
        if (detectRomanized(promptText)) systemInstruction += " Please respond in Hinglish.";
        
        const histSnap = await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).orderBy('createdAt', 'desc').limit(20).get();
        const history = histSnap.docs.map(d => d.data() as Message).reverse();

        const sanitizedHistory: Content[] = history.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: msg.parts || [{ text: msg.content || "" }]
        }));

        try {
            const generativeModel = genAI.getGenerativeModel({ model, safetySettings, systemInstruction });
            const chat = generativeModel.startChat({ history: sanitizedHistory });
            const result = await chat.sendMessage(promptText);
            const text = result.response.text();
            
            const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
            await modelMessageRef.set({ role: 'assistant', content: text, createdAt: FieldValue.serverTimestamp() });

            return { messageId: modelMessageRef.id, text, modelUsed: model };
        } catch (error) {
            logger.error("Error generating chat response:", error);
            throw new HttpsError("internal", "Failed to generate chat response.");
        }
    }
);

// --- Other Functions (Restored with full implementation) ---
export const ensureProfile = onCall<EnsureProfileReq, Promise<EnsureProfileRes>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
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
          createdAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          ...defaults,
        },
      });
    } else {
      const updates: Record<string, unknown> = {
        "profile.lastSeenAt": FieldValue.serverTimestamp(),
        ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [`profile.${k}`, v])),
      };
      if (!snap.data()?.profile?.tier) updates["profile.tier"] = 'free';
      await ref.update(updates);
    }
    return { success: true };
  } catch (e) {
    logger.error("ensureProfile error", e);
    throw new HttpsError("internal", "Failed to ensure profile.");
  }
});

export const createNewSession = onCall<CreateNewSessionReq, Promise<CreateNewSessionRes>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  const { uid } = request.auth;
  const { title, mode, languageIntent } = request.data;

  const ref = db.collection(`aiProfiles/${uid}/sessions`).doc();
  await ref.set({
    title,
    mode,
    languageIntent,
    isPremiumSnapshot: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: ref.id };
});

export const updateSession = onCall<UpdateSessionReq, Promise<UpdateSessionRes>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  const { uid } = request.auth;
  const { sessionId, updates } = request.data;
  await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { success: true };
});

export const deleteSession = onCall<DeleteSessionReq, Promise<DeleteSessionRes>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  const { uid } = request.auth;
  const { sessionId } = request.data;
  if (!sessionId) throw new HttpsError("invalid-argument", "Missing required field: sessionId.");
  await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
  return { success: true };
});

export const uploadImage = onCall<UploadImageReq, Promise<UploadImageRes>>(
    { secrets: ["GEMINI_API_KEY"] },
    async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    const { imageData, fileName } = request.data;
    const uid = request.auth.uid;
  
    const bucket = getStorage().bucket();
    const filePath = `user-uploads/${uid}/images/${fileName}`;
    const file = bucket.file(filePath);
  
    const buffer = Buffer.from(imageData, 'base64');
    
    try {
        await file.save(buffer, { contentType: 'image/png' });
        await file.makePublic();
        return { fileUrl: file.publicUrl() };
    } catch (error) {
        logger.error("Error uploading image:", error);
        throw new HttpsError("internal", "Failed to upload image.");
    }
});

export const performWebSearch = onRequest(
    { secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] },
    async (req, res) => {
      const query = (req.method === 'GET' ? req.query.q : (req.body?.data?.query)) as string | undefined;
      if (!query) { res.status(400).send({ error: "Missing 'query'." }); return; }
  
      const apiKey = process.env.GOOGLE_SEARCH_API_KEY!;
      const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID!;
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
  
      try {
        const response = await fetch(url);
        const json = await response.json() as { items?: any[] };
        if (!response.ok) { 
          logger.error("CSE error", json); 
          res.status(response.status).send({ error: "Search failed" }); 
          return; 
        }
  
        const results = (json.items || []).map((it: any) => ({ title: it.title, link: it.link, snippet: it.snippet }));
        res.status(200).send({ data: { results } });
      } catch (e) {
        logger.error("performWebSearch error", e);
        res.status(500).send({ error: "Unexpected error" });
      }
    }
);

export const deleteAccountData = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    logger.info("Attempting to delete account data for UID:", uid);
    
    try {
      logger.info("Step 1: Deleting Firestore data for user:", uid);
      await db.recursiveDelete(db.collection('aiProfiles').doc(uid));
      logger.info("Step 1 complete. Firestore data deleted.");
    
      logger.info("Step 2: Deleting user from Firebase Authentication for UID:", uid);
      await getAuth().deleteUser(uid);
      logger.info("Step 2 complete. Firebase Auth user deleted successfully.");
    
      return { success: true };
    } catch (error) {
      logger.error("Error during account deletion for UID:", uid, "Error:", error);
      throw new HttpsError("internal", "Failed to delete account data.");
    }
});
