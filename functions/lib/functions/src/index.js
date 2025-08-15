import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
initializeApp();
const db = getFirestore();
/** ------------------ v2 Callables ------------------ */
export const ensureProfile = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { defaults } = request.data;
    const ref = db.doc(`aiProfiles/${uid}`);
    const snap = await ref.get();
    const now = Date.now();
    if (!snap.exists) {
        await ref.set(Object.assign({ uid, defaultMode: 'Friend', languageIntent: 'auto', createdAt: now, lastSeenAt: now }, defaults));
    }
    else {
        await ref.update(Object.assign({ lastSeenAt: now }, defaults));
    }
    return { success: true };
});
export const createNewSession = onCall(async (request) => {
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
});
export const appendUserMessage = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, message } = request.data;
    const messageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
    await messageRef.set(Object.assign(Object.assign({}, message), { id: messageRef.id, createdAt: Date.now() }));
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: Date.now() });
    return { messageId: messageRef.id };
});
export const updateSession = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, updates } = request.data;
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update(Object.assign(Object.assign({}, updates), { updatedAt: FieldValue.serverTimestamp() }));
    return { success: true };
});
export const deleteSession = onCall(async (request) => {
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
});
