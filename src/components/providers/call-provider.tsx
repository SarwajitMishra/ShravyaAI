
"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type CallContextType = {
  isCallActive: boolean;
  isPipViewActive: boolean;
  setIsPipViewActive: React.Dispatch<React.SetStateAction<boolean>>;
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  forceEndCallRef: React.MutableRefObject<(() => void) | null>;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
  elapsedTime: number;
};

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isPipViewActive, setIsPipViewActive] = useState(false);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [elapsedTime, setElapsedTime] = useState(0);
  const forceEndCallRef = useRef<(() => void) | null>(null);

  const startCall = useCallback((sessionId: string, persona: string) => {
    if (isCallActive) return;
    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsCallActive(true);
    setConnectionStatus('connecting');
    setElapsedTime(0);
  }, [isCallActive]);

  const endCall = useCallback(() => {
    // This function can be called by UI elements (like end call button)
    // The actual WebSocket cleanup is triggered via the forceEndCallRef
    // which is set by the voice page itself.
    if (forceEndCallRef.current) {
        forceEndCallRef.current();
    }
    setIsCallActive(false);
    setActiveCallSessionId(null);
    setActivePersona(null);
    setConnectionStatus('disconnected');
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallActive && connectionStatus === 'connected') {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else if (!isCallActive) {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isCallActive, connectionStatus]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  return (
    <CallContext.Provider value={{ 
      isCallActive, 
      isPipViewActive, 
      setIsPipViewActive, 
      activeCallSessionId, 
      activePersona, 
      isMuted, 
      startCall, 
      endCall, 
      toggleMute, 
      forceEndCallRef, 
      connectionStatus, 
      setConnectionStatus,
      elapsedTime
    }}>
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
