"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './auth-provider';
import { useRouter } from 'next/navigation';
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
};

const functions = getFunctions(firebaseApp);
const logCall = httpsCallable(functions, 'logCall');

const CallContext = createContext<CallContextType | undefined>(undefined);

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMutedRef = useRef(isMuted);

  const callStartTimeRef = useRef<number | null>(null);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'reconnecting';

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const playAudio = useCallback(async (audioBuffer: Buffer) => {
    if (!audioContextRef.current && typeof window !== 'undefined') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    try {
        const buffer = await audioContext.decodeAudioData(audioBuffer.buffer.slice(0)); // Create a copy for safety
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true }});
        const newMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
        
        newMediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
                const arrayBuffer = await event.data.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                socketRef.current?.send(JSON.stringify({ event: 'audio', data: buffer.toString('base64') }));
            }
        };
        
        newMediaRecorder.start(500); // Send audio chunks every 500ms
        mediaRecorderRef.current = newMediaRecorder;
    } catch (error) {
        console.error("Error accessing microphone:", error);
        // Consider showing a toast or message to the user
    }
  }, [stopRecording]);

  const endCall = useCallback((forceRedirect = true) => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryCountRef.current = 0;
    
    if (callStartTimeRef.current && activeCallSessionId && activePersona) {
        const endTime = Date.now();
        const duration = Math.round((endTime - callStartTimeRef.current) / 1000); // duration in seconds
        logCall({
            sessionId: activeCallSessionId,
            persona: activePersona as Persona,
            startTime: callStartTimeRef.current,
            duration: duration,
        }).catch(err => console.error("Failed to log call:", err));
    }


    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ event: 'stop' }));
      }
      socketRef.current.onclose = null; // Prevent onclose from firing during manual shutdown
      socketRef.current.close(1000, "Call ended by user");
      socketRef.current = null;
    }
    stopRecording();
    setConnectionStatus('disconnected');
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    callStartTimeRef.current = null;
    if (forceRedirect) router.push('/chat');
  }, [stopRecording, router, activeCallSessionId, activePersona]);

  const connectToWebSocket = useCallback(async (sessionId: string, persona: string) => {
    if (!user) return;
    setConnectionStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

    const token = await user.getIdToken();
    const websocketUrl = `wss://livevoicepipeline-m7rijrszka-uc.a.run.app?token=${token}`;
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
                const audioBuffer = Buffer.from(msg.data, 'base64');
                await playAudio(audioBuffer);
            }
        } catch (e) {
            console.error('Error parsing message or playing audio', e)
        }
    };

    socket.onclose = () => {
        console.log("WebSocket closed");
        stopRecording(); // Stop mic access when connection drops
        if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1);
            console.log(`Connection lost. Reconnecting in ${delay}ms... (Attempt ${retryCountRef.current})`);
            setConnectionStatus('reconnecting');
            retryTimeoutRef.current = setTimeout(() => connectToWebSocket(sessionId, persona), delay);
        } else {
            console.error("Could not reconnect to the call. Ending.");
            endCall();
        }
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // The onclose event will be fired automatically after an error, triggering the retry logic.
    };
  }, [user, startRecording, playAudio, endCall]);


  const startCall = useCallback(async (sessionId: string, persona: string) => {
    if (isCallActive) return;

    callStartTimeRef.current = Date.now();
    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsPipViewActive(false);
    router.push('/voice');
    connectToWebSocket(sessionId, persona);

  }, [isCallActive, connectToWebSocket, router]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  return (
    <CallContext.Provider value={{ isCallActive, connectionStatus, isPipViewActive, setIsPipViewActive, activeCallSessionId, activePersona, isMuted, startCall, endCall, toggleMute }}>
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
