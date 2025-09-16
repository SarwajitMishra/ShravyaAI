
"use client";

import { useEffect } from 'react';
import { useCall } from '@/components/providers/call-provider';
import { usePathname } from 'next/navigation';

/**
 * This component is a client-side only handler that listens to the global call
 * state and manages UI side effects like Picture-in-Picture mode.
 * It renders no UI itself.
 */
export default function CallGlobalUIHandler() {
  const { isCallActive, setIsPipViewActive } = useCall();
  const pathname = usePathname();

  // Effect to handle the Picture-in-Picture (PiP) display
  useEffect(() => {
    // If a call is active AND we navigate away from the voice page, show the PiP view.
    if (isCallActive && pathname !== '/voice') {
      setIsPipViewActive(true);
    } else {
      // Otherwise (if the call ends or we are on the voice page), ensure the PiP is hidden.
      setIsPipViewActive(false);
    }
  }, [isCallActive, pathname, setIsPipViewActive]);

  return null; // This component does not render any visible UI
}
