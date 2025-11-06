"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from './auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/lib/firebase';
import { type Persona } from '@/lib/types';
import { useChatHistoryActions } from '@/hooks/use-chat-history';

// --- Types ---
type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type CallContextType = {
  isCallActive: boolean;
  connectionStatus: ConnectionStatus;
  isPipViewActive: boolean;
  setIsPipViewActive: (isActive: boolean) => void;
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: Persona) => void;
  endCall: () => void;
  toggleMute: () => void;
  elapsedTime: number;
};

// Interface for the expected data from startCallLog
interface StartCallLogResult {
  callId: string;
}

// --- Firebase Functions ---
const functions = getFunctions(firebaseApp);
const startCallLog = httpsCallable(functions, 'startCallLog');
const endCallLog = httpsCallable(functions, 'endCallLog');

const CallContext = createContext<CallContextType | undefined>(undefined);

// --- Helper Functions ---
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { updateSessionType } = useChatHistoryActions();
  const router = useRouter();
  const pathname = usePathname();

  // --- State ---
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // --- Refs for non-stateful data ---
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callLogIdRef = useRef<string | null>(null);
  const callEndedIntentionallyRef = useRef(false);

  const isCallActive = useMemo(() => connectionStatus === 'connected' || connectionStatus === 'connecting' || connectionStatus === 'reconnecting', [connectionStatus]);
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);


  // --- Core Audio & Media Functions ---

  const playAudio = useCallback(async (audioBytes: Uint8Array) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    try {
      const buffer = await audioContextRef.current.decodeAudioData(audioBytes.slice().buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
    } catch (error) {
      console.error("Error playing audio:", error);
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
  
  const startRecording = useCallback(async (socket: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
      
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN && !isMutedRef.current) {
          const arrayBuffer = await event.data.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binaryString = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binaryString += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binaryString);
          socket.send(JSON.stringify({ event: 'audio', data: base64 }));
        }
      };
      
      mediaRecorderRef.current.start(500);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      endCall();
    }
  }, [stopRecording]);


  // --- Central Cleanup Function ---

  const cleanupCall = useCallback(() => {
    console.log("[CallProvider] Cleaning up call resources.");
    
    stopRecording();
    
    if (socketRef.current) {
      socketRef.current.onclose = null; 
      socketRef.current.close(1000, "Cleanup initiated");
      socketRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (activeCallSessionId && callLogIdRef.current) {
      const duration = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0;
      endCallLog({ sessionId: activeCallSessionId, callId: callLogIdRef.current, duration })
        .catch(err => console.error("endCallLog failed:", err));
      updateSessionType(activeCallSessionId, 'text');
    }
    
    setConnectionStatus('disconnected');
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    setElapsedTime(0);
    callStartTimeRef.current = null;
    callLogIdRef.current = null;

  }, [stopRecording, updateSessionType, activeCallSessionId]);


  // --- WebSocket Connection Management ---
  
  const connectToWebSocket = useCallback(async (sessionId: string, persona: Persona) => {
    if (!user) return cleanupCall();

    console.log(`[CallProvider] Connecting to WebSocket for session: ${sessionId}`);
    setConnectionStatus('connecting');
    const token = await user.getIdToken();
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}?token=${token}`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[CallProvider] WebSocket Connected.");
      socket.send(JSON.stringify({ event: 'start', sessionId, persona }));
      startRecording(socket);
    };

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.event) {
        case 'call_started':
          console.log("[CallProvider] Received call_started from server.");
          callEndedIntentionallyRef.current = false;
          setConnectionStatus('connected');
          setActiveCallSessionId(msg.sessionId);
          setActivePersona(msg.persona);
          
          if (!callStartTimeRef.current) {
            callStartTimeRef.current = Date.now();
            setElapsedTime(0);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = setInterval(() => {
              setElapsedTime(prev => prev + 1);
            }, 1000);
          }
          break;
        
        case 'call_ended':
          console.log("[CallProvider] Received call_ended from server.");
          cleanupCall();
          break;

        case 'audio':
          if (msg.data) {
            playAudio(base64ToBytes(msg.data));
          }
          break;
        
        case 'error':
          console.error("[CallProvider] Received error from server:", msg.message);
          break;
      }
    };

    socket.onerror = (error) => {
      console.error("[CallProvider] WebSocket Error:", error);
    };

    socket.onclose = (event) => {
      console.log(`[CallProvider] WebSocket closed. Code: ${event.code}`);
      if (!callEndedIntentionallyRef.current) {
        console.log("[CallProvider] Unexpected closure. Cleaning up UI.");
        cleanupCall();
      }
    };

  }, [user, cleanupCall, playAudio, startRecording]);

  
  // --- Public Context Functions ---

  const startCall = useCallback(async (sessionId: string, persona: Persona) => {
    if (isCallActive && activeCallSessionId === sessionId) {
      if (pathname !== '/voice') {
        router.push(`/voice?sessionId=${sessionId}&persona=${persona}`);
      }
      return;
    }
    
    if (isCallActive) {
      endCall();
    }
    
    console.log(`[CallProvider] Starting call for session: ${sessionId}`);
    callEndedIntentionallyRef.current = false;
    
    try {
      await updateSessionType(sessionId, 'voice');
      const result = await startCallLog({ sessionId, persona });
      // --- FINAL FIX for 'unknown' type ERROR ---
      // Safely cast the 'data' property after receiving it.
      const data = result.data as StartCallLogResult;
      if (data && data.callId) {
        callLogIdRef.current = data.callId;
      }
    } catch (err) {
      console.warn('startCallLog failed (non-blocking)', err);
    }
    
    connectToWebSocket(sessionId, persona);

    if (pathname !== `/voice`) {
      router.push(`/voice?sessionId=${sessionId}&persona=${persona}`);
    }
  }, [isCallActive, activeCallSessionId, pathname, router, updateSessionType, connectToWebSocket]);

  const endCall = useCallback(() => {
    console.log("[CallProvider] User initiated endCall.");
    callEndedIntentionallyRef.current = true;
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ event: 'stop_call' }));
    }
    
    cleanupCall();

  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    setIsMuted(prevMuted => !prevMuted);
  }, []);

  // --- PiP View Logic ---
  useEffect(() => {
    if (isCallActive && pathname !== '/voice') {
      setIsPipViewActive(true);
    } else {
      setIsPipViewActive(false);
    }
  }, [isCallActive, pathname]);

  // --- Final Context Value ---
  const value = useMemo(() => ({ 
    isCallActive, connectionStatus, isPipViewActive, setIsPipViewActive, 
    activeCallSessionId, activePersona, isMuted, startCall, endCall, 
    toggleMute, elapsedTime 
  }), [
    isCallActive, connectionStatus, isPipViewActive, setIsPipViewActive, 
    activeCallSessionId, activePersona, isMuted, startCall, endCall, 
    toggleMute, elapsedTime
  ]);

  return (
    <CallContext.Provider value={value}>
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
