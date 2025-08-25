"use client";

import { Phone, Mic, MicOff, Volume2, PhoneOff } from 'lucide-react';
import { useCall } from '@/components/providers/call-provider';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function PipCallView() {
  // Get the live call state and functions from our global provider
  const { isCallActive, activePersona, isMuted, toggleMute, endCall } = useCall();

  // If there is no active call, this component renders nothing.
  if (!isCallActive) {
    return null;
  }

  // This function will be called when the user clicks the "End Call" button in the PiP view.
  // It prevents the default link navigation and calls our global endCall function with the 'force' flag.
  const handleEndCall = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endCall(true); // Force end the call
  };

  return (
    // This is the main floating container
    <div className="fixed bottom-6 right-6 z-50 bg-background/80 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-2 p-2 border">
      
      {/* This Link makes the persona name and phone icon clickable, taking the user back to the voice screen */}
      <Link href="/voice" className="flex items-center gap-2 text-primary animate-pulse pr-2">
        <Phone className="h-5 w-5" />
        <span className="font-semibold">{activePersona || 'On Call'}</span>
      </Link>
      
      {/* This button uses the global isMuted state and toggleMute function */}
      <Button variant="ghost" size="icon" className="rounded-full" onClick={toggleMute}>
        {isMuted ? <MicOff className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
      </Button>

      {/* This is a placeholder for future speakerphone functionality */}
      <Button variant="ghost" size="icon" className="rounded-full">
        <Volume2 className="h-5 w-5" />
      </Button>
      
      {/* This button uses the local handleEndCall function to stop the call */}
      <Button variant="destructive" size="icon" className="rounded-full" onClick={handleEndCall}>
        <PhoneOff className="h-5 w-5" />
      </Button>
    </div>
  );
}
