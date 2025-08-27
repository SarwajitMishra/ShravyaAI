
"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './auth-provider';
import { useRouter,usePathname  } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/lib/firebase';
import { type Persona } from '@/lib/types';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type CallContextType = {
  isCallActive: boolean;
  connectionStatus: ConnectionStatus;
  isPipViewActive: boolean;
  setIsPipViewActive: (isActive: boolean) => void;
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  elapsedTime: number;
};

const functions = getFunctions(firebaseApp);
const startCallLog = httpsCallable(functions, 'startCallLog');
const endCallLog = httpsCallable(functions, 'endCallLog');


const CallContext = createContext<CallContextType | undefined>(undefined);

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// --- Helpers: base64 <-> bytes (browser-safe, no Buffer) ---
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMuted);
  const callStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallLogIdRef = useRef<string | null>(null);
  
  // A ref to track if the call was intentionally ended by the user or system
  const callEndedIntentionallyRef = useRef(false);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'reconnecting';

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

// Put this helper above, or inline it inside playAudio
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Always returns a brand-new ArrayBuffer (never SharedArrayBuffer)
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

const playAudio = useCallback(async (audioBytes: Uint8Array) => {
  if (!audioContextRef.current && typeof window !== 'undefined') {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  const audioContext = audioContextRef.current;
  if (!audioContext) return;

  try {
    // ✅ Force a real ArrayBuffer for TS and the Web Audio API
    const arrayBuffer: ArrayBuffer = toArrayBuffer(audioBytes);
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (error) {
    console.error("Error decoding or playing audio:", error);
  }
}, []);


  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current) stopRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const newMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });

      newMediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
          const ab = await event.data.arrayBuffer();
          const b64 = bytesToBase64(new Uint8Array(ab));
          socketRef.current?.send(JSON.stringify({ event: 'audio', data: b64 }));
        }
      };

      newMediaRecorder.start(500); // Send audio chunks every 500ms
      mediaRecorderRef.current = newMediaRecorder;
    } catch (error) {
      console.error("Error accessing microphone:", error);
      // Consider showing a toast or message to the user
    }
  }, [stopRecording]);

  const endCall = useCallback(async (forceRedirect = true) => {
    callEndedIntentionallyRef.current = true;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryCountRef.current = 0;

    if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
    }

    if (socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ event: 'stop' }));
        }
        socketRef.current.onclose = null;
        socketRef.current.close(1000, "Call ended by user");
        socketRef.current = null;
    }
    
    // Use the call log ID that was saved when the call started
    if (activeCallLogIdRef.current && activeCallSessionId) {
        const duration = elapsedTime;
        if (!isNaN(duration) && duration >= 0) {
            try {
                await endCallLog({
                    sessionId: activeCallSessionId,
                    callId: activeCallLogIdRef.current,
                    duration,
                });
                console.log('[CallProvider] Successfully logged call end.');
            } catch(err) {
                console.error("[CallProvider] endCallLog function failed:", err);
            }
        } else {
            console.warn('[CallProvider] Skipping call end log due to invalid duration:', duration);
        }
    }


    stopRecording();
    setConnectionStatus('disconnected');
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    callStartTimeRef.current = null;
    activeCallLogIdRef.current = null;
    setElapsedTime(0);

    if (forceRedirect && pathname !== '/chat') router.push('/chat');
}, [stopRecording, router, activeCallSessionId, pathname, elapsedTime]);

  const connectToWebSocket = useCallback(async (sessionId: string, persona: string) => {
    if (!user) return;
    setConnectionStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

    const token = await user.getIdToken();
    // Fallback to a development URL if needed
    const websocketUrl = process.env.NEXT_PUBLIC_VOICE_PIPELINE_URL || `wss://livevoicepipeline-m7rijrszka-uc.a.run.app?token=${token}`;
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");
      retryCountRef.current = 0;
      setConnectionStatus('connected');
      socket.send(JSON.stringify({ event: 'start', persona: persona, sessionId: sessionId }));
      startRecording();
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'audio' && msg.data) {
          const audioBytes = base64ToBytes(msg.data as string);
          await playAudio(audioBytes);
        }
      } catch (e) {
        console.error('Error parsing message or playing audio', e);
      }
    };

    socket.onclose = () => {
        // If the call was intentionally ended, do nothing further.
        if (callEndedIntentionallyRef.current) {
            console.log("WebSocket closed intentionally.");
            return;
        }

      console.log("WebSocket closed unexpectedly");
      stopRecording(); // Stop mic access when connection drops
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1);
        console.log(`Connection lost. Reconnecting in ${delay}ms... (Attempt ${retryCountRef.current})`);
        setConnectionStatus('reconnecting');
        retryTimeoutRef.current = setTimeout(() => connectToWebSocket(sessionId, persona), delay);
      } else {
        console.error("Could not reconnect to the call. Ending.");
        // Pass false to prevent redirect loop if already on chat page
        endCall(pathname !== '/chat');
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      // The onclose event will be fired automatically after an error, triggering the retry logic.
    };
  }, [user, startRecording, playAudio, endCall, pathname]);

  const startCall = useCallback(async (sessionId: string, persona: string) => {
    // If a call is already active, just navigate to the voice page.
    if (isCallActive) {
        if (pathname !== '/voice') {
            router.push('/voice');
        }
        return;
    }

    // Set the state immediately to indicate a call is starting.
    callEndedIntentionallyRef.current = false;
    callStartTimeRef.current = Date.now();
    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsPipViewActive(false);
    setConnectionStatus('connecting'); // Explicitly set connecting status

    // Then, perform navigation.
    if (pathname !== '/voice') {
        router.push('/voice');
    }

    // Log the call start
    try {
        const result: any = await startCallLog({ sessionId, persona });
        if (result.data.callId) {
            activeCallLogIdRef.current = result.data.callId;
            console.log(`[CallProvider] Started call log with ID: ${result.data.callId}`);
        } else {
             throw new Error("startCallLog did not return a callId");
        }
    } catch (err) {
        console.error("[CallProvider] startCallLog function failed:", err);
        // Optionally, show a toast to the user that the call could not be started
        endCall(false); // End call without redirecting
        return; // Abort starting the call
    }

    // Start the timer
    setElapsedTime(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
    }, 1000);
    
    // Finally, connect to the WebSocket
    connectToWebSocket(sessionId, persona);

  }, [isCallActive, connectToWebSocket, router, pathname, endCall]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  return (
    <CallContext.Provider value={{ isCallActive, connectionStatus, isPipViewActive, setIsPipViewActive, activeCallSessionId, activePersona, isMuted, startCall, endCall, toggleMute, elapsedTime }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
