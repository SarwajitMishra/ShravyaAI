
"use client";

console.log('[CLIENT LOG] call-provider.tsx module loaded');
import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './auth-provider';
import { useRouter,usePathname  } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/lib/firebase';
import { type Persona } from '@/lib/types';
import { useChatHistory } from '@/hooks/use-chat-history';

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
  endCall: () => void; // Simplified: endCall is always a "hard" end now.
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
  const { updateSessionType } = useChatHistory();
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
  const activeCallSessionIdRef = useRef<string | null>(null);
  
  const callEndedIntentionallyRef = useRef(false);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'reconnecting' || connectionStatus === 'connecting';

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // *** NEW CORE LOGIC ***
  // This effect declaratively controls the PiP view based on the URL and call state.
  useEffect(() => {
    if (isCallActive && pathname !== '/voice') {
      // If a call is active and we are NOT on the voice page, enable PiP.
      setIsPipViewActive(true);
    } else {
      // Otherwise (no call active, or we are on the voice page), disable PiP.
      setIsPipViewActive(false);
    }
  }, [isCallActive, pathname]);
  // *** END NEW CORE LOGIC ***

  function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
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

      newMediaRecorder.start(500);
      mediaRecorderRef.current = newMediaRecorder;
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }, [stopRecording]);

  // Simplified endCall - it only does a "hard" end.
  const endCall = useCallback(async () => {
    console.log('[CallProvider] Hard ending: Terminating call session.');
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

    const sessionIdForLog = activeCallSessionIdRef.current;
    if (sessionIdForLog) {
      // Reset the session type to 'text'
      updateSessionType(sessionIdForLog, 'text');
    }
    if (activeCallLogIdRef.current && sessionIdForLog) {
        const duration = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0;
        
        if (!isNaN(duration) && duration >= 0) {
            try {
                await endCallLog({
                    sessionId: sessionIdForLog,
                    callId: activeCallLogIdRef.current,
                    duration,
                });
            } catch(err) {
                console.error("[CallProvider] endCallLog function failed:", err);
            }
        }
    }

    stopRecording();
    setConnectionStatus('disconnected');
    setIsPipViewActive(false); // Ensure PiP is off when call is truly ended
    setActiveCallSessionId(null);
    setActivePersona(null);
    callStartTimeRef.current = null;
    activeCallLogIdRef.current = null;
    setElapsedTime(0);
    activeCallSessionIdRef.current = null;

    if (pathname !== '/chat') router.push('/chat');
}, [stopRecording, router, pathname, updateSessionType]);


const connectToWebSocket = useCallback(async (sessionId: string, persona: string) => {

  if (!user || typeof window === 'undefined') return;

  setConnectionStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');
  
  const token = await user.getIdToken();
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (!wsBaseUrl) {
    console.error("FATAL: NEXT_PUBLIC_WS_URL is not defined.");
    endCall();
    return;
  }

  const websocketUrl = `${wsBaseUrl}?token=${token}`;
  const socket = new WebSocket(websocketUrl);
  socketRef.current = socket;

  socket.onopen = () => {
    retryCountRef.current = 0;
    setConnectionStatus('connected');
    socket.send(JSON.stringify({
        event: 'start',
        persona: persona,
        sessionId: sessionId,
        isReconnect: retryCountRef.current > 0
    }));
    startRecording();
  };

  socket.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.event === 'audio' && msg.data) {
        await playAudio(base64ToBytes(msg.data as string));
      }
    } catch (e) {
      console.error('Error processing message', e);
    }
  };

  socket.onclose = (event) => {
    if (callEndedIntentionallyRef.current) {
        console.log("WebSocket closed intentionally.");
        return;
    }

    stopRecording();
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1);
      console.log(`Connection lost. Reconnecting in ${delay}ms...`);
      setConnectionStatus('reconnecting');
      retryTimeoutRef.current = setTimeout(() => connectToWebSocket(sessionId, persona), delay);
    } else {
      console.error("Could not reconnect after multiple attempts. Marking as disconnected.");
      endCall();
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}, [user, startRecording, stopRecording, playAudio, endCall, pathname]);

const startCall = useCallback(async (sessionId: string, persona: string) => {
    if (activeCallSessionIdRef.current === sessionId) {
      if (pathname !== '/voice') router.push('/voice');
      return;
    }
  
    callEndedIntentionallyRef.current = false;
    callStartTimeRef.current = Date.now();
    setActiveCallSessionId(sessionId);
    activeCallSessionIdRef.current = sessionId;
    setActivePersona(persona);
    setIsPipViewActive(false);
    setConnectionStatus('connecting');
  
    try {
      // Mark the session as a 'voice' session
      await updateSessionType(sessionId, 'voice');
      const result: any = await startCallLog({ sessionId, persona });
      if (result?.data?.callId) {
        activeCallLogIdRef.current = result.data.callId;
      }
    } catch (err) {
      console.warn('startCallLog failed (non-blocking)', err);
    }
  
    setElapsedTime(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
  
    connectToWebSocket(sessionId, persona);
  
  }, [connectToWebSocket, router, pathname, updateSessionType]);


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

    