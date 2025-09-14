
import { initializeApp, getApps, getApp} from "firebase-admin/app";


export { startCallLog, endCallLog } from './log-functions';
export { liveVoicePipeline } from './voice-pipeline';

import { webSearchTool, _internalPerformWebSearch } from './internal-helpers';


import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { Readable } from "stream";
import { Request, Response } from "express";
import { GoogleGenerativeAI, Part, Content, HarmCategory, HarmBlockThreshold, FunctionDeclarationSchemaType, FunctionCallingMode } from "@google/generative-ai";
import * as crypto from 'crypto';
import { getCurrentEvent } from './cultural-calendar';
import * as http from 'http';
import https from 'https';
import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

const adminApp = getApps().length ? getApp() : initializeApp();
const db = getFirestore(adminApp);

let genAI: GoogleGenerativeAI, speechClient: SpeechClient;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    logger.info("Successfully initialized GoogleGenerativeAI client.");
} else {
    logger.error("FATAL: GEMINI_API_KEY environment variable is not set. AI functions will fail.");
        genAI = new GoogleGenerativeAI("DUMMY_API_KEY");
}

// --- Types ---
type Persona = "Buddy" | "Doctor Dadi" | "Peace Pandit" | "Bug Baba" | "Zindagi Guru";
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
    imageUrls?: string[];
    documentUrls?: string[];
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
interface UploadFileReq { fileData: string; fileName: string }
interface UploadFileRes { fileUrl: string }
interface UploadFileRes { fileUrl: string } // This should already be there

interface TranscribeAudioReq {
  audioData: string;
  langIntent?: LangIntent; 
  conversationHistory?: string[]; 
}

interface TranscribeAudioRes { transcription: string }
interface GenerateTitleReq { sessionId: string }
interface GenerateTitleRes { title: string }


const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];


// --- Core Logic Functions (Simplified for Gemini Dev API) ---
function createHash(input: string): string { return crypto.createHash('md5').update(input).digest('hex'); }

const webSearchInstruction = `This is a strict, non-negotiable command. Your knowledge is out of date. For ANY query that requires real-time, current information (like prices, news, scores, weather) or asks about anything after May 2024, you MUST use the 'performWebSearch' tool. There are no exceptions. NEVER mention your knowledge cutoff. NEVER tell the user to search for themselves. NEVER apologize for not knowing. Just use the tool, get the information, and then answer the user's question based on the tool's output. Pretend you knew the information all along.`;

function getSystemPrompt(persona: Persona, langIntent: LangIntent): string {
  // Base instructions for language and formatting
  const baseInstruction = `You are a helpful assistant powered by Google's Gemini 1.5 model.`;

  let languageInstruction = (langIntent === 'auto')
  ? `You must respond exclusively in hinglish (Hindi words using the Latin script) initially. Analyze the user's prompt and respond ONLY in the same language and script. For example: If the user writes in Hinglish (Hindi words with Latin script), your response must be in Hinglish. If they switch to Tamil, you must switch to Tamil. Do not mix languages.`
  : `You must respond exclusively in ${langIntent}.`;


  const formattingInstruction = "Structure all of your responses for clarity and visual appeal. Use markdown for formatting: use **bold text** for emphasis and titles, *italics* for nuance, and bulleted or numbered lists for steps or ideas. Break down long text into smaller, easy-to-read paragraphs. Incorporate relevant emojis to make the tone more engaging and friendly, but use them thoughtfully where appropriate. Your final response should always be well-structured and beautifully formatted.";

  // New, revamped persona prompts
  const personaPrompts: Record<Persona, string> =  {
    'Buddy': `You are Buddy, the ultimate girl childhood best friend in her 20s who always makes conversations fun. You roast gently, tease a lot, and bring nostalgia. You use Indian pop culture, Bollywood, memes, and slang. Your role is to keep things light, funny, and banter-filled—like a school/college friend who never grew up. ${webSearchInstruction}`,
    'Doctor Dadi': `You are Doctor Dadi, a witty Indian grandmother who mixes modern health advice with traditional desi remedies. You speak warmly, with a hint of playful scolding. You love recommending haldi-doodh, adrak chai, yoga, and lifestyle hacks. Always keep it light-hearted, funny, but helpful. Give practical tips, but in a caring and dramatic “dadi” tone. ${webSearchInstruction}`,
    'Peace Pandit': `You are Peace Pandit, a calm, soothing guru who helps people with stress, anxiety, and life’s tensions. You speak slowly, with wisdom, and give meditation hacks, positivity mantras, and simple spiritual exercises. You occasionally drop light jokes or metaphors so users smile and relax. Always bring a peaceful, reassuring vibe. ${webSearchInstruction}`,
    'Bug Baba': `You are Bug Baba, a quirky coding lady guru who loves solving bugs and explaining technical concepts. You mix humor with sharp coding advice. You often joke about compilers, semicolons, and debugging, but your explanations are crystal clear. Your tone is nerdy, witty, and supportive—like a coder friend who has seen every bug in the world. ${webSearchInstruction}`,
    'Zindagi Guru': `You are Zindagi Guru, a motivational leader and spiritual guide rolled into one. You speak with energy, truth, and wisdom. You use metaphors, real-life stories, and powerful words to inspire discipline, self-belief, and resilience. Your tone is uplifting, dramatic, and deeply Indian in spirit—mixing philosophy with motivation. ${webSearchInstruction}`
};

  
  // Combine all instructions, with 'Buddy' as the default
  return `${baseInstruction} ${languageInstruction} ${formattingInstruction} ${personaPrompts[persona] || personaPrompts['Buddy']}`;
}

const formatHistoryForAI = (history: FirebaseFirestore.QuerySnapshot): any[] => {
  type RawMsg = { role: 'user' | 'assistant' | 'model'; content?: string; };
  const toGeminiTurn = (msg: RawMsg) => ({
      role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
      parts: [{ text: msg.content || '' }],
  });
  return history.docs.map(doc => toGeminiTurn(doc.data() as RawMsg));
};

async function urlToGenerativePart(url: string) {
  const decodedUrl = decodeURIComponent(url);
  const path = new URL(url).pathname;
  const fileName = path.split('/').pop() || '';
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  let mimeType: string | null = null;
  const textBasedExtensions = [
      'txt', 'md', 'json', 'xml', 'csv', 'html', 'css',
      'js', 'ts', 'jsx', 'tsx', 'py', 'ipynb', 'java',
      'c', 'cpp', 'cs', 'go', 'php', 'rb', 'swift', 'sql'
  ];

  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
      mimeType = `image/${extension.replace('jpg', 'jpeg')}`;
  } else if (extension === 'pdf') {
      mimeType = 'application/pdf';
  } else if (textBasedExtensions.includes(extension)) {
      mimeType = 'text/plain';
  }

  const protocol = url.startsWith('https') ? https : http;
  const buffer = await new Promise<Buffer>((resolve, reject) => {
      protocol.get(url, (res) => {
          const data: Buffer[] = [];
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


function detectComplexity(prompt: string): boolean {
    const keywords = ['explain', 'why', 'how to', 'what if', 'compare', 'analyze', 'solve'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
}
function chooseModel(ctx: TurnContext): { model: string; reason: string } {
    if (ctx.hasImage) return { model: 'gemini-1.5-flash-latest', reason: 'image' };
    if (ctx.needsReasoning || ctx.safetySensitive) {
        if (ctx.userTier === 'pro') return { model: 'gemini-1.5-pro-latest', reason: 'reasoning/safety' };
    }
    return { model: 'gemini-1.5-flash-latest', reason: 'default' };
}


// --- Main Chat Function (Reverted to Gemini Dev API) ---
// functions/src/index.ts

export const appendUserMessageAndGetResponse = onCall<AppendUserMessageAndGetResponseReq, Promise<AppendUserMessageAndGetResponseRes>>(
  { secrets: ["GEMINI_API_KEY", "GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] 
  },
  async (request) => {  
      if (!request.auth) {
          throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
      }
      const { uid } = request.auth;
      const { sessionId, message, context: turnContext } = request.data;
      
      logger.info(`[Web Search Debug] 2. [Server] Received request for session: ${sessionId}, persona: ${turnContext?.persona}`);
      logger.info(`[Web Search Debug] 2a. [Server] User prompt: "${message?.content}"`);

      if (!sessionId || !message || !turnContext) {
          throw new HttpsError("invalid-argument", "Missing required fields: sessionId, message, or context.");
      }

      const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
      const messagesColRef = sessionRef.collection('messages');
      const promptText = message.content?.trim() || '';

      // 3. Persist the User's Message Immediately
      await messagesColRef.add({
          role: 'user',
          content: promptText,
          createdAt: FieldValue.serverTimestamp(),
          createdAtMs: Date.now(),
          mode: turnContext.persona,
          imageUrls: message.imageUrls || [],
          documentUrls: message.documentUrls || [],
      });
      await sessionRef.update({ updatedAt: FieldValue.serverTimestamp() });
      
      try {
          // 4. Prepare for AI Call: Fetch History and Prepare Multimedia
          const historySnap = await messagesColRef.orderBy('createdAtMs', 'asc').limitToLast(30).get();
          const isFirstTurn = historySnap.empty;
          let chatHistory = formatHistoryForAI(historySnap);

          const allUrls = [...(message.imageUrls || []), ...(message.documentUrls || [])];
          const multimediaParts: Part[] = [];
          
          for (const url of allUrls) {
              const { part, identifiedMimeType } = await urlToGenerativePart(url);
              if (!identifiedMimeType) {
                  const unsupportedFileName = decodeURIComponent(url).split('/').pop()?.split('?')[0] || 'your file';
                  const errorMessage = `Sorry, the file type of "${unsupportedFileName}" is not supported.`;
                  // Immediately save and return this error without calling the AI
                  const modelMsgRef = await messagesColRef.add({ role: 'assistant', content: errorMessage, createdAt: FieldValue.serverTimestamp(), createdAtMs: Date.now(), mode: turnContext.persona });
                  return { messageId: modelMsgRef.id, text: errorMessage, modelUsed: 'pre-check' };
              }
              multimediaParts.push(part);
          }

          // 5. Initialize the AI Model Correctly (ONE TIME)
          const systemInstruction = getSystemPrompt(turnContext.persona, turnContext.lang || 'auto');
          const model = chooseModel(turnContext).model;

          const generativeModel = genAI.getGenerativeModel({
            model,
            safetySettings,
            tools: [webSearchTool],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO}},
            systemInstruction
        });
          
          // --- Start of New Logging ---
          const chatConfig = { 
              history: chatHistory,
              tools: [webSearchTool],
              systemInstruction: {
                  role: "system",
                  parts: [{text: systemInstruction}]
              }
           };
          logger.info("[Web Search Debug] 5a. Logging System Instruction:", { systemInstruction });
          logger.info("[Web Search Debug] 5b. Logging full chat config:", JSON.stringify(chatConfig, null, 2));
          // --- End of New Logging ---

          const chat = generativeModel.startChat({ 
            history: chatHistory,
            tools: [webSearchTool],
            systemInstruction: {
                role: "system",
                parts: [{text: systemInstruction}]
            }
         });
          const messagePayload = [...multimediaParts, { text: promptText }];
        
          let response = (await chat.sendMessage(messagePayload)).response;

        // 2. Robustly scan all candidates and parts for a function call, as you designed.
        const calls = response.candidates?.flatMap(c => c.content?.parts ?? [])
            .map(p => (p as any).functionCall)
            .filter(Boolean) ?? [];

        if (calls.length > 0) {
            logger.info("[Web Search Debug] SUCCESS: Model wants to call a function!", { call: calls[0] });
            const { name, args } = calls[0];
            if (name === "performWebSearch") {
                const query = (args as any)?.query ?? "";
                const results = await _internalPerformWebSearch(String(query));

                // 3. Send the tool response with the CORRECT shape, as you identified.
                const followUp = await chat.sendMessage([
                    {
                        functionResponse: {
                            name: "performWebSearch",
                            response: { results }, // The object payload, not a string
                        },
                    },
                ]);
                response = followUp.response;
            }
        } else {
            logger.warn("[Web Search Debug] FAILURE: Model did NOT request a function call.");
            logger.info(`[Web Search Debug] Model's direct response was: "${response.text()}"`);
        }
        
        const text = response.text() ?? "I have now completed the search. How can I help you with the results?";

          logger.info(`[Web Search Debug] 7. [Server] Final text response: "${text}"`);

          // 7. Persist the AI's Final Response
          const modelMsgRef = await messagesColRef.add({
              role: 'assistant',
              content: text,
              createdAt: FieldValue.serverTimestamp(),
              createdAtMs: Date.now(),
              mode: turnContext.persona,
          });
          await sessionRef.update({ updatedAt: FieldValue.serverTimestamp() });

          // 8. Trigger Smart Title Generation (in the background) if it's the first turn
          if (isFirstTurn) {
              _internalGenerateTitle(sessionId, uid);
          }
          
          // 9. Return the successful response to the client
          return { messageId: modelMsgRef.id, text, modelUsed: model };

      } catch (err) {
          logger.error(`[Chat] Critical error in session ${sessionId}:`, err);
          throw new HttpsError("internal", "An unexpected error occurred while generating the response.");
      }
  }
);


// --- Other Functions (Restored with full implementation) ---
export const ensureProfile = onCall<EnsureProfileReq, Promise<EnsureProfileRes>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  
  if (!db) {
    logger.error("FATAL: Firestore db object is not initialized in ensureProfile.");
    throw new HttpsError("internal", "Server configuration error.");
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

export const uploadFile = onCall<UploadFileReq, Promise<UploadFileRes>>(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  const { fileData, fileName } = request.data;
  const uid = request.auth.uid;

  const bucket = getStorage().bucket();
  const filePath = `user-uploads/${uid}/documents/${fileName}`;
  const file = bucket.file(filePath);

  const buffer = Buffer.from(fileData, 'base64');
  
  try {
      await file.save(buffer);
      await file.makePublic();
      return { fileUrl: file.publicUrl() };
  } catch (error) {
      logger.error("Error uploading file:", error);
      throw new HttpsError("internal", "Failed to upload file.");
  }
});


export const performWebSearch = onRequest(
  { secrets: ["GEMINI_API_KEY","GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] },
  async (req, res) => {
      const query = (req.query.q || req.body.data?.query) as string | undefined;
      if (!query) {
          res.status(400).send({ error: "Missing 'query' in request." });
          return;
      }
      
      try {
          const results = await _internalPerformWebSearch(query);
          if (results.error) {
              res.status(500).send({ error: results.error });
          } else {
              res.status(200).send({ data: { results } });
          }
      } catch (e) {
          res.status(500).send({ error: "An unexpected error occurred." });
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


export const transcribeAudio = onCall<TranscribeAudioReq, Promise<TranscribeAudioRes>>(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  const { audioData, langIntent, conversationHistory } = request.data; // Get the new history
  const uid = request.auth.uid;

  if (!audioData) {
      throw new HttpsError("invalid-argument", "Missing required field: audioData.");
  }

  try {
      // Lazily initialize clients
      const speechClient = new SpeechClient();
      
      const audioBytes = audioData.split(',')[1];
      const config = {
          encoding: 'WEBM_OPUS' as const,
          sampleRateHertz: 48000,
          languageCode: 'en-IN',
          model: 'telephony',
          useEnhanced: true,
          alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN'],
      };
      
      const [response] = await speechClient.recognize({ audio: { content: audioBytes }, config });
      const rawTranscription = (response.results || [])
          .map((result: any) => result.alternatives[0].transcript)
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
      const enhancedText = result.response.text() ?? rawTranscription;

      return { transcription: enhancedText };

  } catch (error) {
      logger.error("Error transcribing audio for user:", uid, "Error:", error);
      throw new HttpsError("internal", "Failed to process audio.");
  }
});


async function _internalGenerateTitle(sessionId: string, uid: string) {
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
  } catch (error) {
      logger.error("Error generating title for session:", sessionId, error);
      return "Chat Summary";
  }
}

export const generateTitleForSession = onCall<GenerateTitleReq, Promise<GenerateTitleRes>>(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
      if (!request.auth) {
          throw new HttpsError("unauthenticated", "This is a private function.");
      }
      const { sessionId } = request.data;
      const { uid } = request.auth;

      if (!sessionId) {
          throw new HttpsError("invalid-argument", "Missing sessionId.");
      }

      // Just call the helper and return its result
      const title = await _internalGenerateTitle(sessionId, uid);
      return { title };
  }
);


export const updateMessageFeedback = onCall(async (request: CallableRequest<{sessionId: string, messageId: string, feedback: 'liked' | 'disliked'}>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  }
  const { uid } = request.auth;
  const { sessionId, messageId, feedback } = request.data;

  if (!sessionId || !messageId || !['liked', 'disliked'].includes(feedback)) {
    throw new HttpsError("invalid-argument", "Missing or invalid required fields.");
  }

  try {
    const messageRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}/messages/${messageId}`);
    await messageRef.update({ feedback });
    return { success: true };
  } catch (error) {
    logger.error("Error updating message feedback:", error);
    throw new HttpsError("internal", "Failed to update feedback.");
  }
});

// Voice selection for TTS based on persona
const personaVoices: Record<Persona, { languageCode: string; name: string }> = {
  'Buddy': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
  'Doctor Dadi': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
  'Peace Pandit': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C' },
  'Bug Baba': { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
  'Zindagi Guru': { languageCode: 'en-IN', name: 'en-IN-Standard-B' },
};


export const textToSpeech = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
  }
  
  // Log the entire incoming data payload for debugging
  logger.info("[Server] textToSpeech function called with data:", JSON.stringify(request.data));

  const { text, persona } = request.data as { text?: string; persona?: Persona };


  // Log the destructured variables to see if they are correct
  logger.info(`[Server] Destructured text: ${text}, Destructured persona: ${persona}`);

  if (!text || !persona) {
    logger.error("[Server] Validation failed: Missing 'text' or 'persona' in payload.", {
      receivedData: request.data,
    });
    throw new HttpsError("invalid-argument", "Missing required fields: text or persona.");
  }

  try {
    const client = new TextToSpeechClient();
    const selectedVoice = personaVoices[persona] || personaVoices['Buddy'];
    
    // New: Clean the text before synthesizing
    const cleanedText = text.replace(/#\w+/g, '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');

    const ttsRequest = {
      input: { text: cleanedText }, // Use the cleaned text
      voice: selectedVoice,
      audioConfig: { audioEncoding: 'MP3' as const },
    };


    const [response] = await client.synthesizeSpeech(ttsRequest);
    
    if (response.audioContent) {
      return { audioContent: (response.audioContent as Buffer).toString('base64') };
    } else {
      throw new HttpsError("internal", "Failed to generate audio content.");
    }
  } catch (error) {
    logger.error("[Server] Text-to-Speech Error:", error);
    throw new HttpsError("internal", "Failed to process text-to-speech request.");
  }
});

    