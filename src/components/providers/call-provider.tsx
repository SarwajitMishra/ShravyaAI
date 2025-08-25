
"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './auth-provider';
import { useRouter } from 'next/navigation';

type CallContextType = {
  isCallActive: boolean;
  isPipViewActive: boolean;
  setIsPipViewActive: (isActive: boolean) => void;
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: string) => void;
  endCall: () => void;
  toggleMute: () => void;
};

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  const [isCallActive, setIsCallActive] = useState(false);
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const playAudio = useCallback(async (audioBuffer: Buffer) => {
    if (!audioContextRef.current) {
        if (typeof window !== 'undefined') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    try {
        const buffer = await audioContext.decodeAudioData(audioBuffer.buffer);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    } catch (error) {
        console.error("Error decoding or playing audio:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
      }
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current) {
        stopRecording();
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
        
        newMediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
                const arrayBuffer = await event.data.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Audio = buffer.toString('base64');
                socketRef.current?.send(JSON.stringify({ event: 'audio', data: base64Audio }));
            }
        };
        
        newMediaRecorder.start(500); // Send audio chunks every 500ms
        mediaRecorderRef.current = newMediaRecorder;
    } catch (error) {
        console.error("Error accessing microphone:", error);
    }
  }, [stopRecording]);

  const endCall = useCallback(() => {
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ event: 'stop' }));
      }
      socketRef.current.close(1000, "Call ended by user");
      socketRef.current = null;
    }
    stopRecording();
    setIsCallActive(false);
    setIsPipViewActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    router.push('/chat');
  }, [stopRecording, router]);


  const startCall = useCallback(async (sessionId: string, persona: string) => {
    if (!user || isCallActive) return;

    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsCallActive(true);
    setIsPipViewActive(false);
    router.push('/voice');

    const token = await user.getIdToken();
    const websocketUrl = `wss://livevoicepipeline-m7rijrszka-uc.a.run.app?token=${token}`;
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
        console.log("WebSocket connected");
        socket.send(JSON.stringify({ event: 'start', persona: persona, sessionId: sessionId }));
        startRecording();
    };
    
    socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === 'audio' && msg.data) {
            const audioBuffer = Buffer.from(msg.data, 'base64');
            await playAudio(audioBuffer);
        }
    };

    socket.onclose = () => {
        console.log("WebSocket closed");
        if (isCallActive) {
          // If the call was supposed to be active, treat it as an ended call.
          endCall();
        }
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        socket.close();
    };

  }, [user, isCallActive, startRecording, playAudio, endCall, router]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  return (
    <CallContext.Provider value={{ isCallActive, isPipViewActive, setIsPipViewActive, activeCallSessionId, activePersona, isMuted, startCall, endCall, toggleMute }}>
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
