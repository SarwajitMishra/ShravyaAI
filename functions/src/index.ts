
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { Readable } from "stream";
import { Request, Response } from "express";
import { VertexAI, Part, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
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
    role: 'user' | 'model';
    parts: Part[];
    createdAt?: string;
}


// --- Firebase and Vertex AI Initialization ---
initializeApp();
const db = getFirestore();
const vertexAi = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });

// Define safety settings for the generative model
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
];

// --- Core Logic Functions ---

/**
 * Creates a hash for a given string.
 * @param input The string to hash.
 * @returns The MD5 hash of the string.
 */
function createHash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
}

/**
 * Gets a response from the cache if it exists and is not expired.
 * @param key The cache key.
 * @returns The cached response or null.
 */
async function getCache(key: string): Promise<string | null> {
    const docRef = db.collection('cache').doc(key);
    const doc = await docRef.get();
    if (doc.exists) {
        const data = doc.data();
        // Cache expires after 6 hours
        if (data && (new Date().getTime() - data.createdAt.toMillis()) < 6 * 60 * 60 * 1000) {
            return data.response;
        }
    }
    return null;
}

/**
 * Sets a response in the cache.
 * @param key The cache key.
 * @param response The response to cache.
 */
async function setCache(key: string, response: string): Promise<void> {
    const docRef = db.collection('cache').doc(key);
    await docRef.set({
        response,
        createdAt: new Date(),
    });
}


/**
 * A simple heuristic to detect if the prompt requires complex reasoning.
 * @param prompt The user's text prompt.
 * @returns True if the prompt suggests a need for reasoning.
 */
function detectComplexity(prompt: string): boolean {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}

/**
 * Truncates the conversation history to stay within a token limit.
 * A simple character count is used as a proxy for token count.
 * @param messages The array of messages.
 * @param maxChars The maximum number of characters to allow.
 * @returns The truncated array of messages.
 */
function truncateContext(messages: Message[], maxChars = 12000): Message[] {
    let totalChars = 0;
    const truncatedMessages: Message[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        // Assuming the first part is the primary text content
        const content = message.parts[0]?.text || '';
        const messageChars = content.length;

        if (totalChars + messageChars <= maxChars) {
            truncatedMessages.unshift(message);
            totalChars += messageChars;
        } else {
            // Stop adding messages if we've reached the limit
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
function detectRomanized(text: string): boolean {
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
function chooseModel(ctx: TurnContext): { model: string; reason: string } {
    let model = 'gemini-1.5-flash';
    let reason = 'default';

    if (ctx.hasImage) {
        model = 'gemini-1.5-flash-vision';
        reason = 'image';
    }

    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro') {
            model = 'claude-3.5-sonnet'; // or 'gpt-4o'
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
function getSystemPrompt(persona: Persona): string {
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
function normalizeTone(text: string): string {
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

exports.appendUserMessageAndGetResponse = onCall(
    { secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] },
    async (request: any) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
        }

        const { uid } = request.auth;
        const { sessionId, message, context } = request.data;

        if (!sessionId || !message || !context) {
            throw new HttpsError("invalid-argument", "Missing required fields: sessionId, message, or context.");
        }

        // 1. Append the user's message to Firestore
        const now = new Date().toISOString();
        const userMessage: Message = { ...message, createdAt: now };

        const userMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        await userMessageRef.set(userMessage);
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: now });

        // 2. Check cache for a response
        const promptText = message.parts[0].text;
        const cacheKey = createHash(promptText);
        const cachedResponse = await getCache(cacheKey);

        if (cachedResponse) {
            logger.info(`Cache hit for prompt: "${promptText}"`);
            const modelMessage: Message = {
                role: 'model',
                parts: [{ text: cachedResponse }],
                createdAt: new Date().toISOString(),
            };
            const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
            await modelMessageRef.set(modelMessage);
            return {
                messageId: modelMessageRef.id,
                text: cachedResponse,
                modelUsed: 'cache',
            };
        }


        // 3. Prepare context for the LLM
        const turnContext: TurnContext = {
            ...context,
            needsReasoning: detectComplexity(message.parts[0].text),
        };

        const { model, reason } = chooseModel(turnContext);
        logger.info(`Selected model: ${model} for user ${uid} due to: ${reason}`);

        let systemPrompt = getSystemPrompt(turnContext.persona);
        const isRomanized = detectRomanized(promptText);
        if (isRomanized) {
            systemPrompt += " Please respond in Hinglish.";
        }
        
        const currentEvent = getCurrentEvent(turnContext.locale || 'en-IN');
        if (currentEvent) {
            systemPrompt += ` Also, please acknowledge the current festival of ${currentEvent}.`;
        }


        // 4. Fetch recent message history
        const historySnapshot = await db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`)
            .orderBy('createdAt', 'desc')
            .limit(20) // Fetch more messages to have enough context for truncation
            .get();

        const history = historySnapshot.docs.map(doc => doc.data() as Message).reverse();
        const truncatedHistory = truncateContext(history);


        // 5. Call the selected Vertex AI model
        try {
            const generativeModel = vertexAi.preview.getGenerativeModel({
                model,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: systemPrompt }],
                },
                safetySettings,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.8,
                    topP: 0.9,
                },
            });

            const contents = [...truncatedHistory, { role: 'user', parts: message.parts }];

            const resp = await generativeModel.generateContent({ contents });

            let modelResponseText = "Sorry, I couldn't generate a response.";
            if (resp.response.candidates && resp.response.candidates.length > 0 && resp.response.candidates[0].content.parts.length > 0) {
                modelResponseText = resp.response.candidates[0].content.parts[0].text ?? modelResponseText;
            }

            const normalizedResponse = normalizeTone(modelResponseText);


            // 6. Save the model's response to Firestore and cache
            await setCache(cacheKey, normalizedResponse);
            const modelMessage: Message = {
                role: 'model',
                parts: [{ text: normalizedResponse }],
                createdAt: new Date().toISOString(),
            };
            const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
            await modelMessageRef.set(modelMessage);

            return {
                messageId: modelMessageRef.id,
                text: normalizedResponse,
                modelUsed: model,
            };

        } catch (error) {
            logger.error("Error generating chat response:", error);

            // Fallback mechanism
            if (model !== 'gemini-1.5-flash') {
                try {
                    logger.warn(`Model ${model} failed, falling back to gemini-1.5-flash.`);
                    const fallbackModel = vertexAi.preview.getGenerativeModel({ model: 'gemini-1.5-flash' });
                    const fallbackResp = await fallbackModel.generateContent({
                        contents: [...truncatedHistory, { role: 'user', parts: message.parts }],
                    });

                    if (fallbackResp.response.candidates && fallbackResp.response.candidates.length > 0) {
                        const fallbackText = fallbackResp.response.candidates[0].content.parts[0].text ?? "No response";
                        const normalizedFallback = normalizeTone(fallbackText);
                        // Also save the fallback response
                        const modelMessage: Message = { role: 'model', parts: [{ text: normalizedFallback }], createdAt: new Date().toISOString() };
                        const modelMessageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
                        await modelMessageRef.set(modelMessage);
                        return { messageId: modelMessageRef.id, text: normalizedFallback, modelUsed: 'gemini-1.5-flash' };
                    }
                } catch (fallbackError) {
                    logger.error("Fallback model also failed:", fallbackError);
                }
            }
            
            throw new HttpsError("internal", "Failed to generate chat response, even after fallback.");
        }
    }
);


exports.ensureProfile = onCall(
    async (request: any) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
      }
      const { uid } = request.auth;
      const defaults = request.data?.defaults || {};
      
      try {
        const ref = db.doc(`aiProfiles/${uid}`);
        const snap = await ref.get();
        const now = new Date().toISOString();

        if (!snap.exists) {
          const newProfile = {
            profile: {
              uid,
              displayName: request.auth.token.name || "",
              defaultMode: "Friend",
              languageIntent: "auto",
              tier: 'free', // Set default tier
              createdAt: now,
              lastSeenAt: now,
              ...defaults,
            },
          };
          await ref.set(newProfile);
        } else {
          const updatedProfile: { [key: string]: any } = {
            "profile.lastSeenAt": now,
            ...defaults,
          };
          // Ensure tier exists if profile is old
          if (!snap.data()?.profile?.tier) {
            updatedProfile["profile.tier"] = 'free';
          }
          await ref.update(updatedProfile);
        }
        return {success: true};
      } catch (error) {
        console.error("Error in ensureProfile:", error);
        throw new HttpsError("internal", "Failed to ensure profile.");
      }
    }
);

exports.createNewSession = onCall(
    async (request: any) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
      }
      const { uid } = request.auth;
      const { title, mode, languageIntent } = request.data;

      try {
        const ref = db.collection(`aiProfiles/${uid}/sessions`).doc();
        const now = new Date().toISOString();
        const newSession = {
          title,
          mode,
          languageIntent,
          isPremiumSnapshot: false,
          createdAt: now,
          updatedAt: now,
        };
        await ref.set(newSession);
        return {sessionId: ref.id};
      } catch (error) {
        console.error("Error in createNewSession:", error);
        throw new HttpsError("internal", "Failed to create a new session.");
      }
    }
);

exports.updateSession = onCall(
    async (request: any) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
      }
      const { uid } = request.auth;
      const { sessionId, updates } = request.data;
      await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      return {success: true};
    }
);

exports.deleteSession = onCall(
    async (request: any) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
      }
      const { uid } = request.auth;
      const { sessionId } = request.data;

      if (!sessionId) {
        throw new HttpsError("invalid-argument", "Missing required field: sessionId.");
      }
      try {
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
        return {success: true};
      } catch (error) {
        console.error("Error in deleteSession:", error);
        throw new HttpsError("internal", "Failed to delete session.");
      }
    }
);

exports.deleteAccountData = onCall(async (request: any) => {
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

exports.uploadImage = onCall(async (request: any) => {
if (!request.auth) {
  throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
}
const { imageData, fileName } = request.data;
const uid = request.auth.uid;
const bucket = getStorage().bucket();
const buffer = Buffer.from(imageData, 'base64');
const filePath = `user-uploads/${uid}/images/${fileName}`;
const file = bucket.file(filePath);
const stream = new Readable();
stream.push(buffer);
stream.push(null);

return new Promise((resolve, reject) => {
  stream.pipe(file.createWriteStream())
    .on("error", (error) => reject(new HttpsError("internal", `File upload failed: ${error.message}`)))
    .on("finish", async () => {
      await file.makePublic();
      resolve({ fileUrl: file.publicUrl() });
    });
});
});


exports.performWebSearch = onRequest(
  { secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] },
  async (req: Request, res: Response) => {
    const { query } = req.body.data;
    if (!query) {
      res.status(400).send({ error: "Missing 'query' in request body." });
      return;
    }
    
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url);
      const responseData = await response.json();
      
      if (!response.ok) {
        console.error("Google Search API Error:", responseData);
        res.status(response.status).send({ error: "Failed to fetch search results." });
        return;
      }
      
      const results = responseData.items?.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      })) || [];

      res.status(200).send({ data: { results } });

    } catch (error) {
      console.error("Error in performWebSearch:", error);
      res.status(500).send({ error: "An unexpected error occurred." });
    }
  }
);
