"use client";

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCall } from '@/components/providers/call-provider';

/**
 * This component is responsible for initiating a voice call based on URL parameters.
 * It should be placed on the /voice page and wrapped in a <Suspense> boundary.
 * It reads the 'sessionId' and 'persona' from the URL and starts the call.
 */
export function VoiceCallInitializer() {
  const { startCall, isCallActive } = useCall();
  const searchParams = useSearchParams();
  const calledRef = useRef(false); // Prevents calling startCall multiple times on re-render

  useEffect(() => {
    // If a call is already active or we have already initiated a call, do nothing.
    if (isCallActive || calledRef.current) {
      return;
    }

    const sessionId = searchParams.get('sessionId');
    const persona = searchParams.get('persona');

    // If both parameters exist in the URL, it's a valid call request.
    if (sessionId && persona) {
      console.log(`[VoiceCallInitializer] Found session params. Attempting to start call for session: ${sessionId}`);
      calledRef.current = true; // Mark that we've attempted to start the call
      startCall(sessionId, persona);
    }
  }, [searchParams, startCall, isCallActive]);

  return null; // This component does not render any visible UI
}
