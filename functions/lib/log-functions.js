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
exports.endCallLog = exports.startCallLog = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// --- Safe Firebase Initialization ---
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
exports.startCallLog = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, persona } = request.data;
    if (!sessionId || !persona) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: sessionId or persona.');
    }
    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        await sessionRef.set({ type: 'voice' }, { merge: true });
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Started',
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        const callDocRef = await db.collection(sessionRef.path + '/calls').add({
            persona,
            startTime: firestore_1.FieldValue.serverTimestamp(),
            duration: 0,
        });
        logger.info(`[startCallLog] Call started and logged for session ${sessionId} with call ID ${callDocRef.id}`);
        return { success: true, callId: callDocRef.id };
    }
    catch (error) {
        logger.error("[startCallLog] Error:", error);
        throw new https_1.HttpsError('internal', 'Failed to start call log.');
    }
});
exports.endCallLog = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, callId, duration } = request.data;
    if (!sessionId || !callId || duration === undefined) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: sessionId, callId, or duration.');
    }
    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callDocRef = db.doc(`${sessionRef.path}/calls/${callId}`);
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Ended',
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        await callDocRef.update({
            duration: Math.round(duration),
        });
        logger.info(`[endCallLog] Call ended and duration updated for call ${callId}`);
        return { success: true };
    }
    catch (error) {
        logger.error("[endCallLog] Error:", error);
        throw new https_1.HttpsError('internal', 'Failed to end call log.');
    }
});
