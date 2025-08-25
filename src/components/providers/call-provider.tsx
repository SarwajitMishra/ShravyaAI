
"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';

type CallContextType = {
  isCallActive: boolean;
  isPipViewActive: boolean; // Add this line
  setIsPipViewActive: (isActive: boolean) => void; // Add this line
  activeCallSessionId: string | null;
  activePersona: string | null;
  isMuted: boolean;
  startCall: (sessionId: string, persona: string) => void;
  endCall: (force?: boolean) => void;
  toggleMute: () => void;
  forceEndCallRef: React.MutableRefObject<(() => void) | null>;
};

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isPipViewActive, setIsPipViewActive] = useState(false); // Add this line
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const forceEndCallRef = useRef<(() => void) | null>(null);

  const startCall = useCallback((sessionId: string, persona: string) => {
    setActiveCallSessionId(sessionId);
    setActivePersona(persona);
    setIsCallActive(true);
    setIsPipViewActive(false); // Ensure PiP is hidden when starting
  }, []);

  const endCall = useCallback((force = false) => {
    if (force && forceEndCallRef.current) {
        forceEndCallRef.current();
    }
    setIsCallActive(false);
    setIsPipViewActive(false); // Ensure PiP is hidden when ending
    setActiveCallSessionId(null);
    setActivePersona(null);
  }, []);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  return (
    <CallContext.Provider value={{ isCallActive, isPipViewActive, setIsPipViewActive, activeCallSessionId, activePersona, isMuted, startCall, endCall, toggleMute, forceEndCallRef }}>
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
