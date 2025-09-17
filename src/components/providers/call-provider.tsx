
"use client";

console.log('[CLIENT LOG] call-provider.tsx module loaded');
import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from './auth-provider';
import { useRouter,usePathname  } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/lib/firebase';
import { type Persona } from '@/lib/types';
import { useChatHistoryActions } from '@/hooks/use-chat-history';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type CallContextType = {
  isCallActive: boolean;
  connectionStatus: ConnectionStatus;
  isPipViewActive: boolean;
  setIsPipViewActive: (isActive: boolean) => void;
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: string, options?: { navigate?: boolean }) => void;
  endCall: (options?: { navigateToChat?: boolean; isPassive?: boolean }) => void;
  toggleMute: () => void;
  elapsedTime: number;
};

const functions = getFunctions(firebaseApp);
const startCallLog = httpsCallable(functions, 'startCallLog');
const endCallLog = httpsCallable(functions, 'endCallLog');


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
  const { updateSessionType } = useChatHistoryActions(); // DECOUPLED
  const router = useRouter();
  const pathname = usePathname();

  const providerId = useMemo(() => Math.random().toString(36).substring(2, 9), []);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMuted);
  const callStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallLogIdRef = useRef<string | null>(null);
  const activeCallSessionIdRef = useRef<string | null>(null);
  const callEndedIntentionallyRef = useRef(false);
  const endCallRef = useRef<((options?: { navigateToChat?: boolean; isPassive?: boolean }) => Promise<void>) | null>(null);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'reconnecting' || connectionStatus === 'connecting';

  const isCallActiveRef = useRef(isCallActive);
  useEffect(() => {
      isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const stateRef = useRef({ router, pathname, user });
  useEffect(() => { stateRef.current = { router, pathname, user }; });

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    const channel = new BroadcastChannel('call_status_channel');

    const handleMessage = (event: MessageEvent) => {
      const { type, payload, senderId } = event.data;
      if (senderId === providerId) return; // Ignore messages from self

      switch (type) {
        case 'call_started':
          if (!isCallActiveRef.current) {
            callEndedIntentionallyRef.current = false;
            setConnectionStatus('connected');
            setActiveCallSessionId(payload.sessionId);
            activeCallSessionIdRef.current = payload.sessionId;
            setActivePersona(payload.persona);
            callStartTimeRef.current = Date.now();
            setElapsedTime(0);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
          }
          break;

        case 'call_ended':
          if (isCallActiveRef.current) {
              if (endCallRef.current) {
                  endCallRef.current({ isPassive: true });
              }
          }
          break;
      }
    };
    
    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [providerId]);

  useEffect(() => {
    if (isCallActive && pathname !== '/voice') {
      setIsPipViewActive(true);
    } else {
      setIsPipViewActive(false);
    }
  }, [isCallActive, pathname]);

  const playAudio = useCallback(async (audioBytes: Uint8Array) => {
    // ... (implementation remains the same)
  }, []);

  const stopRecording = useCallback(() => {
    // ... (implementation remains the same)
  }, []);
  
  const startRecording = useCallback(() => {
    // ... (implementation remains the same)
  }, []);

  const connectToWebSocket = useCallback(async (sessionId: string, persona: string) => {
    // ... (implementation remains the same)
  }, [user, startRecording, stopRecording, playAudio]);

  const endCall = useCallback(async (options: { navigateToChat?: boolean; isPassive?: boolean } = {}) => {
    const { navigateToChat = false, isPassive = false } = options;

    if (!isPassive) {
        const channel = new BroadcastChannel('call_status_channel');
        channel.postMessage({ type: 'call_ended', senderId: providerId });
        channel.close();
    }

    const { router, pathname } = stateRef.current;
    callEndedIntentionallyRef.current = true;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryCountRef.current = 0;

    if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
    }
    
    if (!isPassive) {
      stopRecording();
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
      }
      if (socketRef.current) {
          if (socketRef.current.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ event: 'stop' }));
          socketRef.current.onclose = null; 
          socketRef.current.close(1000, "Call ended by user");
          socketRef.current = null;
      }
    }

    const sessionIdForLog = activeCallSessionIdRef.current;
    if (sessionIdForLog) updateSessionType(sessionIdForLog, 'text');
    
    if (activeCallLogIdRef.current && sessionIdForLog) {
        const duration = callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0;
        if (!isNaN(duration) && duration >= 0) {
            try { await endCallLog({ sessionId: sessionIdForLog, callId: activeCallLogIdRef.current, duration }); }
            catch(err) { console.error("[CallProvider] endCallLog function failed:", err); }
        }
    }

    setConnectionStatus('disconnected');
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    callStartTimeRef.current = null;
    activeCallLogIdRef.current = null;
    setElapsedTime(0);
    activeCallSessionIdRef.current = null;

    if (navigateToChat && pathname !== '/chat') router.push('/chat');
  }, [providerId, stopRecording, updateSessionType]);

  useEffect(() => { endCallRef.current = endCall; }, [endCall]);

  const startCall = useCallback(async (sessionId: string, persona: string, options?: { navigate?: boolean }) => {
    const { router, pathname } = stateRef.current;

    if (isCallActive) {
        if (activeCallSessionIdRef.current === sessionId) {
            if (pathname !== '/voice') router.push('/voice');
            return;
        } else {
          await endCall({ navigateToChat: false });
        }
    }
    
    const channel = new BroadcastChannel('call_status_channel');
    channel.postMessage({
        type: 'call_started',
        payload: { sessionId, persona },
        senderId: providerId
    });
    channel.close();

    callEndedIntentionallyRef.current = false;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
        mediaStreamRef.current = stream;
    } catch (error) {
        console.error("FATAL: Could not acquire microphone. Aborting call.", error);
        await endCall({ navigateToChat: false });
        return;
    }

    callStartTimeRef.current = Date.now();
    setActiveCallSessionId(sessionId);
    activeCallSessionIdRef.current = sessionId;
    setActivePersona(persona as Persona);
    setIsPipViewActive(false);
    setConnectionStatus('connecting');
  
    try {
      await updateSessionType(sessionId, 'voice');
      const result: any = await startCallLog({ sessionId, persona });
      if (result?.data?.callId) activeCallLogIdRef.current = result.data.callId;
    } catch (err) { console.warn('startCallLog failed (non-blocking)', err); }
  
    setElapsedTime(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
  
    connectToWebSocket(sessionId, persona as Persona);
    const { navigate = true } = options || {};
    if (navigate && pathname !== '/voice') {
      router.push(`/voice?sessionId=${sessionId}&persona=${persona}`);
    }

  }, [providerId, connectToWebSocket, updateSessionType, isCallActive, endCall]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

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
