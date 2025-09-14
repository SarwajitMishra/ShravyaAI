
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore,FieldValue} from "firebase-admin/firestore";

// --- Safe Firebase Initialization ---
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();

export const startCallLog = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, persona } = request.data;
    if (!sessionId || !persona) {
        throw new HttpsError('invalid-argument', 'Missing required fields: sessionId or persona.');
    }

    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        
        await sessionRef.set({ type: 'voice' }, { merge: true });
        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Started',
            createdAt: FieldValue.serverTimestamp()
        });

        const callDocRef = await db.collection(sessionRef.path + '/calls').add({
            persona,
            startTime: FieldValue.serverTimestamp(),
            duration: 0,
        });

        logger.info(`[startCallLog] Call started and logged for session ${sessionId} with call ID ${callDocRef.id}`);
        return { success: true, callId: callDocRef.id };
    } catch (error) {
        logger.error("[startCallLog] Error:", error);
        throw new HttpsError('internal', 'Failed to start call log.');
    }
});


export const endCallLog = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;
    const { sessionId, callId, duration } = request.data;

    if (!sessionId || !callId || duration === undefined) {
        throw new HttpsError('invalid-argument', 'Missing required fields: sessionId, callId, or duration.');
    }

    try {
        const sessionRef = db.doc(`aiProfiles/${uid}/sessions/${sessionId}`);
        const callDocRef = db.doc(`${sessionRef.path}/calls/${callId}`);

        await db.collection(sessionRef.path + '/messages').add({
            role: 'system',
            content: 'Live Call Ended',
            createdAt: FieldValue.serverTimestamp()
        });

        await callDocRef.update({
            duration: Math.round(duration),
        });
        
        logger.info(`[endCallLog] Call ended and duration updated for call ${callId}`);
        return { success: true };
    } catch (error) {
        logger.error("[endCallLog] Error:", error);
        throw new HttpsError('internal', 'Failed to end call log.');
    }
});
