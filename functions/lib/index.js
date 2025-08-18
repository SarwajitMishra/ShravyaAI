import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { uploadImage } from "./upload-image.js";
initializeApp();
const db = getFirestore();
/** ------------------ v2 Callables ------------------ */
export const ensureProfile = onCall(async (request) => {
    console.log("ensureProfile triggered.");
    if (!request.auth) {
        console.error("Authentication check failed in ensureProfile.");
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    console.log("Authentication check passed in ensureProfile.");
    const { uid } = request.auth;
    const { defaults } = request.data || {};
    console.log(`Received data in ensureProfile: uid=${uid}, 
          defaults=${JSON.stringify(defaults)}`);
    try {
        const ref = db.doc(`aiProfiles/${uid}`);
        const snap = await ref.get();
        const now = new Date().toISOString();
        if (!snap.exists) {
            console.log(`No profile found for uid=${uid}. Creating a new one.`);
            const newProfile = {
                profile: Object.assign({ uid, displayName: request.auth.token.name || "", defaultMode: "Friend", languageIntent: "auto", createdAt: now, lastSeenAt: now }, defaults),
            };
            console.log("Attempting to write new profile to Firestore:", JSON.stringify(newProfile, null, 2));
            await ref.set(newProfile);
            console.log("Successfully wrote new profile to Firestore.");
        }
        else {
            console.log(`Profile found for uid=${uid}. Updating last seen.`);
            const updatedProfile = Object.assign({ "profile.lastSeenAt": now }, defaults);
            console.log("Attempting to update profile in Firestore:", JSON.stringify(updatedProfile, null, 2));
            await ref.update(updatedProfile);
            console.log("Successfully updated profile in Firestore.");
        }
        console.log(`ensureProfile completed successfully for uid=${uid}.`);
        return { success: true };
    }
    catch (error) {
        console.error("Error in ensureProfile:", error);
        throw new HttpsError("internal", "Failed to ensure profile.", error);
    }
});
export const createNewSession = onCall(async (request) => {
    console.log("createNewSession triggered.");
    if (!request.auth) {
        console.error("Authentication check failed.");
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    console.log("Authentication check passed.");
    const { uid } = request.auth;
    const { title, mode, languageIntent } = request.data;
    console.log(`Received data: uid=${uid}, title=${title}, 
          mode=${mode}, languageIntent=${languageIntent}`);
    try {
        const ref = db.collection(`aiProfiles/${uid}/sessions`).doc();
        const now = new Date().toISOString();
        console.log(`Generated new session ID: ${ref.id}`);
        const newSession = {
            title,
            mode,
            languageIntent,
            isPremiumSnapshot: false,
            createdAt: now,
            updatedAt: now,
        };
        console.log("Attempting to write to Firestore with data:", JSON.stringify(newSession, null, 2));
        await ref.set(newSession);
        console.log("Successfully wrote to Firestore.");
        console.log(`Returning session ID: ${ref.id}`);
        return { sessionId: ref.id };
    }
    catch (error) {
        console.error("Error in createNewSession:", error);
        throw new HttpsError("internal", "Failed to create a new session.", error);
    }
});
export const appendUserMessage = onCall(async (request) => {
    console.log("appendUserMessage triggered.");
    if (!request.auth) {
        console.error("Authentication check failed in appendUserMessage.");
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    console.log("Authentication check passed in appendUserMessage.");
    const { uid } = request.auth;
    const { sessionId, message } = request.data;
    console.log(`Received data in appendUserMessage: uid=${uid}, 
          sessionId=${sessionId}`);
    try {
        const messageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        const now = new Date().toISOString();
        const newMessage = Object.assign(Object.assign({}, message), { createdAt: now });
        console.log("Attempting to write message to Firestore with data:", JSON.stringify(newMessage, null, 2));
        await messageRef.set(newMessage);
        console.log("Successfully wrote message to Firestore.");
        console.log("Attempting to update session's updatedAt timestamp.");
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`)
            .update({ updatedAt: now });
        console.log("Successfully updated session timestamp.");
        return { messageId: messageRef.id };
    }
    catch (error) {
        console.error("Error in appendUserMessage:", error);
        throw new HttpsError("internal", "Failed to append message.", error);
    }
});
export const updateSession = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, updates } = request.data;
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update(Object.assign(Object.assign({}, updates), { updatedAt: new Date().toISOString() }));
    return { success: true };
});
export const deleteSession = onCall(async (request) => {
    console.log("deleteSession triggered.");
    if (!request.auth) {
        console.error("Authentication check failed in deleteSession.");
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    console.log("Authentication check passed in deleteSession.");
    const { uid } = request.auth;
    const { sessionId } = request.data;
    console.log(`Received data in deleteSession: uid=${uid}, 
          sessionId=${sessionId}`);
    if (!sessionId) {
        console.error("Invalid argument: sessionId is missing.");
        throw new HttpsError("invalid-argument", "Missing required field: sessionId.");
    }
    try {
        console.log(`Attempting to delete session ${sessionId} for ${uid}.`);
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
        console.log("Successfully deleted session from Firestore.");
        return { success: true };
    }
    catch (error) {
        console.error("Error in deleteSession:", error);
        throw new HttpsError("internal", "Failed to delete session.", error);
    }
});
export const deleteAccountData = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    try {
        // Delete Firestore data
        await db.recursiveDelete(db.collection("aiProfiles").doc(uid));
        // Delete Firebase Auth user
        await getAuth().deleteUser(uid);
        return { success: true };
    }
    catch (error) {
        console.error("Error deleting account data:", error);
        throw new HttpsError("internal", "Failed to delete account data.", error);
    }
});
export const performWebSearch = onRequest({ secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] }, async (req, res) => {
    var _a;
    // This is now a standard HTTPS function for server-to-server calls.
    const { query } = req.body.data;
    if (!query) {
        res.status(400).send({ error: "Missing 'query' in request body." });
        return;
    }
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;
    const url = "https://www.googleapis.com/customsearch/v1?key=" +
        `${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    console.log(`[performWebSearch] Performing search for: "${query}"`);
    try {
        const response = await fetch(url);
        const responseData = await response.json();
        if (!response.ok) {
            console.error("Google Search API Error:", responseData);
            res.status(response.status)
                .send({ error: "Failed to fetch search results." });
            return;
        }
        const results = ((_a = responseData.items) === null || _a === void 0 ? void 0 : _a.map((item) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
        }))) || [];
        console.log(`[performWebSearch] Found ${results.length} results.`);
        res.status(200).send({ data: { results } });
    }
    catch (error) {
        console.error("Error in performWebSearch:", error);
        res.status(500).send({ error: "An unexpected error occurred." });
    }
});
export { uploadImage };
//# sourceMappingURL=index.js.map