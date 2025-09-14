"use client";

console.log('[CLIENT LOG] call-provider.tsx module loaded');
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
  endCall: (forceRedirect?: boolean) => void;
  toggleMute: () => void;
  elapsedTime: number;
};

const functions = getFunctions(firebaseApp);
const startCallLog = httpsCallable(functions, 'startCallLog');
const endCallLog = httpsCallable(functions, 'endCallLog');
let audioStream: MediaStream | null = null;

const CallContext = createContext<CallContextType | undefined>(undefined);

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

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
  const callEndedIntentionallyRef = useRef(false);
  const elapsedTimeRef = useRef(elapsedTime);

  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'reconnecting' || connectionStatus === 'connecting';

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    console.log(`[CP_LIFECYCLE] CallProvider MOUNTED. Path: ${pathname}. Timestamp: ${Date.now()}`);
    return () => {
      console.log(`[CP_LIFECYCLE] CallProvider UNMOUNTING. Path: ${pathname}. Timestamp: ${Date.now()}`);
    };
  }, [pathname]);

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
        if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.ondataavailable = null; // Clean up listener
        mediaRecorderRef.current = null;
    }
  }, []);

  const stopAudioStream = useCallback(() => {
    if (audioStream) {
        console.log(`[STREAM] Audio stream DESTROYED. Timestamp: ${Date.now()}`);
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
  }, []);

  const endCall = useCallback(async (forceRedirect = true) => {
    callEndedIntentionallyRef.current = true;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryCountRef.current = 0;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;

    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ event: 'stop' }));
      }
      socketRef.current.onclose = null;
      socketRef.current.close(1000, "Call ended by user");
      socketRef.current = null;
    }
    
    if (activeCallLogIdRef.current && activeCallSessionId) {
        const duration = elapsedTimeRef.current;
        if (!isNaN(duration) && duration >= 0) {
            try {
                await endCallLog({ sessionId: activeCallSessionId, callId: activeCallLogIdRef.current, duration });
            } catch(err) {
                console.error("[CallProvider] endCallLog function failed:", err);
            }
        }
    }

    stopRecording();
    stopAudioStream();
    setConnectionStatus('disconnected');
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    callStartTimeRef.current = null;
    activeCallLogIdRef.current = null;
    setElapsedTime(0);

    if (forceRedirect && pathname !== '/chat') router.push('/chat');
  }, [stopRecording, stopAudioStream, router, activeCallSessionId, pathname]);

  const startRecording = useCallback(() => {
    console.log(`[RECORDER] Attempting to start recording. audioStream is ${audioStream ? 'not null' : 'NULL'}. Timestamp: ${Date.now()}`);
    if (mediaRecorderRef.current) { 
        stopRecording();
    }
    if (!audioStream) {
         console.error("[CallProvider] Cannot start recording, audio stream not available.");
         endCall(false);
         return;
    }

    const newMediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm; codecs=opus' });

    newMediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
            const ab = await event.data.arrayBuffer();
            const b64 = bytesToBase64(new Uint8Array(ab));
            socketRef.current?.send(JSON.stringify({ event: 'audio', data: b64 }));
        }
    };

    newMediaRecorder.start(500);
    mediaRecorderRef.current = newMediaRecorder;
  }, [stopRecording, endCall]);

  const connectToWebSocket = useCallback(async (sessionId: string, persona: string) => {
    if (!user) return;
    setConnectionStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');
    const token = await user.getIdToken();
    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsBaseUrl) {
      endCall(false);
      return;
    }
    const websocketUrl = `${wsBaseUrl}?token=${token}`;
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      const isReconnect = retryCountRef.current > 0;
      retryCountRef.current = 0;
      setConnectionStatus('connected');
      const startMessage = { event: 'start', persona, sessionId, isReconnect };
      socket.send(JSON.stringify(startMessage));
      
      startRecording();
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'audio' && msg.data) await playAudio(base64ToBytes(msg.data as string));
      } catch (e) {
        console.error('Error parsing message or playing audio', e);
      }
    };

    socket.onclose = (event) => {
        console.log(`[SOCKET] Connection closed. Intentional: ${callEndedIntentionallyRef.current}. Code: ${event.code}. Timestamp: ${Date.now()}`);
        console.log(`[SOCKET] State on close: audioStream is ${audioStream ? 'not null' : 'NULL'}.`);
        if (audioStream && audioStream.getAudioTracks().length > 0) {
            console.log(`[SOCKET] Audio track state on close: ${audioStream.getAudioTracks()[0].readyState}`);
        }

        if (callEndedIntentionallyRef.current) {
            console.log('[SOCKET] Closed intentionally, not reconnecting.');
            return;
        }

        stopRecording();

        if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1);
            console.log(`[SOCKET] Attempting reconnect #${retryCountRef.current} in ${delay}ms.`);
            setConnectionStatus('reconnecting');
            retryTimeoutRef.current = setTimeout(() => connectToWebSocket(sessionId, persona), delay);
        } else {
            console.error('[SOCKET] Max retries reached. Ending call.');
            endCall(pathname !== '/chat');
        }
    };

    socket.onerror = (error) => {
      console.error("WebSocket onerror event fired:", error);
    };
  }, [user, startRecording, playAudio, endCall, pathname, stopRecording]);

  const startCall = useCallback(async (sessionId: string, persona: string) => {
    if (isCallActive) return;

    callEndedIntentionallyRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      audioStream = stream;
      console.log(`[STREAM] Audio stream CREATED. Timestamp: ${Date.now()}`);
  } catch (error) {
      console.error("[CallProvider] Error accessing microphone:", error);
      return; 
  }

    
    console.log('[CLIENT LOG] Setting up new call state.');
    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsPipViewActive(false);
    setConnectionStatus('connecting');

    try {
      const result: any = await startCallLog({ sessionId, persona });
      if (result?.data?.callId) activeCallLogIdRef.current = result.data.callId;
    } catch (err) {
      console.warn('[CLIENT LOG] "startCallLog" failed (non-blocking). Continuing to WebSocket.', err);
    }

    setElapsedTime(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);

    connectToWebSocket(sessionId, persona);

  }, [isCallActive, connectToWebSocket]);

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
