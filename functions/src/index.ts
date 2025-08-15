
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Mode, LangIntent, AiProfile, AiMessage } from "../../src/lib/types";

initializeApp();
const db = getFirestore();

// --- Type Definitions for v2 Callable Functions ---
// These define the request and response shapes for our functions.

interface EnsureProfileData { defaults?: Partial<AiProfile> }
interface EnsureProfileResult { success: boolean }

interface CreateNewSessionData { title: string; mode: Mode; languageIntent: LangIntent }
interface CreateNewSessionResult { sessionId: string }

interface AppendUserMessageData { sessionId: string; message: Omit<AiMessage, 'id'|'createdAt'> }
interface AppendUserMessageResult { messageId: string }

interface UpdateSessionData { sessionId: string; updates: { title?: string; isArchived?: boolean } }
interface UpdateSessionResult { success: boolean }

interface DeleteSessionData { sessionId: string }
interface DeleteSessionResult { success: boolean }

/** ------------------ v2 Callables ------------------ */

export const ensureProfile = onCall<EnsureProfileData, Promise<EnsureProfileResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { defaults } = request.data;

    const ref = db.doc(`aiProfiles/${uid}`);
    const snap = await ref.get();
    const now = Date.now();

    if (!snap.exists) {
      await ref.set({
        uid,
        defaultMode: 'Friend',
        languageIntent: 'auto',
        createdAt: now,
        lastSeenAt: now,
        ...defaults,
      });
    } else {
      await ref.update({ lastSeenAt: now, ...defaults });
    }
    return { success: true };
  }
);

export const createNewSession = onCall<CreateNewSessionData, Promise<CreateNewSessionResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { title, mode, languageIntent } = request.data;
    
    const ref = db.collection(`aiProfiles/${uid}/sessions`).doc();
    const now = Date.now();
    
    await ref.set({
      id: ref.id,
      uid,
      title,
      mode,
      languageIntent,
      createdAt: now,
      updatedAt: now,
    });
    
    return { sessionId: ref.id };
  }
);

export const appendUserMessage = onCall<AppendUserMessageData, Promise<AppendUserMessageResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, message } = request.data;
    
    const messageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
    await messageRef.set({ ...message, id: messageRef.id, createdAt: Date.now() });
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: Date.now() });
    
    return { messageId: messageRef.id };
  }
);

export const updateSession = onCall<UpdateSessionData, Promise<UpdateSessionResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, updates } = request.data;
    
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  }
);

export const deleteSession = onCall<DeleteSessionData, Promise<DeleteSessionResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId } = request.data;
    
    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Missing required field: sessionId.");
    }
    
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
    return { success: true };
  }
);
