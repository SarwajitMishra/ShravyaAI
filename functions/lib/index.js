"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const stream_1 = require("stream");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/** ------------------ v2 Callables ------------------ */
exports.ensureProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { defaults } = request.data;
    try {
        const ref = db.doc(`aiProfiles/${uid}`);
        const snap = await ref.get();
        const now = new Date().toISOString();
        if (!snap.exists) {
            const newProfile = {
                profile: Object.assign({ uid, displayName: request.auth.token.name || "", defaultMode: "Friend", languageIntent: "auto", createdAt: now, lastSeenAt: now }, defaults),
            };
            await ref.set(newProfile);
        }
        else {
            const updatedProfile = Object.assign({ "profile.lastSeenAt": now }, defaults);
            await ref.update(updatedProfile);
        }
        return { success: true };
    }
    catch (error) {
        console.error("Error in ensureProfile:", error);
        throw new https_1.HttpsError("internal", "Failed to ensure profile.");
    }
});
exports.createNewSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
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
        return { sessionId: ref.id };
    }
    catch (error) {
        console.error("Error in createNewSession:", error);
        throw new https_1.HttpsError("internal", "Failed to create a new session.");
    }
});
exports.appendUserMessage = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, message } = request.data;
    try {
        const messageRef = db.collection(`aiProfiles/${uid}/sessions/${sessionId}/messages`).doc();
        const now = new Date().toISOString();
        const newMessage = Object.assign(Object.assign({}, message), { createdAt: now });
        await messageRef.set(newMessage);
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update({ updatedAt: now });
        return { messageId: messageRef.id };
    }
    catch (error) {
        console.error("Error in appendUserMessage:", error);
        throw new https_1.HttpsError("internal", "Failed to append message.");
    }
});
exports.updateSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId, updates } = request.data;
    await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).update(Object.assign(Object.assign({}, updates), { updatedAt: new Date().toISOString() }));
    return { success: true };
});
exports.deleteSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    const { sessionId } = request.data;
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing required field: sessionId.");
    }
    try {
        await db.doc(`aiProfiles/${uid}/sessions/${sessionId}`).delete();
        return { success: true };
    }
    catch (error) {
        console.error("Error in deleteSession:", error);
        throw new https_1.HttpsError("internal", "Failed to delete session.");
    }
});
exports.deleteAccountData = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { uid } = request.auth;
    try {
        await db.recursiveDelete(db.collection('aiProfiles').doc(uid));
        await (0, auth_1.getAuth)().deleteUser(uid);
        return { success: true };
    }
    catch (error) {
        console.error("Error deleting account data:", error);
        throw new https_1.HttpsError("internal", "Failed to delete account data.");
    }
});
exports.uploadImage = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "This function must be called while authenticated.");
    }
    const { imageData, fileName } = request.data;
    const uid = request.auth.uid;
    const bucket = (0, storage_1.getStorage)().bucket();
    const buffer = Buffer.from(imageData, 'base64');
    const filePath = `user-uploads/${uid}/images/${fileName}`;
    const file = bucket.file(filePath);
    const stream = new stream_1.Readable();
    stream.push(buffer);
    stream.push(null);
    return new Promise((resolve, reject) => {
        stream.pipe(file.createWriteStream())
            .on("error", (error) => reject(new https_1.HttpsError("internal", `File upload failed: ${error.message}`)))
            .on("finish", async () => {
            await file.makePublic();
            resolve({ fileUrl: file.publicUrl() });
        });
    });
});
exports.performWebSearch = (0, https_1.onRequest)({ secrets: ["GOOGLE_SEARCH_API_KEY", "PROGRAMMABLE_SEARCH_ENGINE_ID"] }, async (req, res) => {
    var _a;
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
        const results = ((_a = responseData.items) === null || _a === void 0 ? void 0 : _a.map((item) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
        }))) || [];
        res.status(200).send({ data: { results } });
    }
    catch (error) {
        console.error("Error in performWebSearch:", error);
        res.status(500).send({ error: "An unexpected error occurred." });
    }
});
//# sourceMappingURL=index.js.map