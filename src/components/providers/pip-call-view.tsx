
"use client";

import { Phone, Mic, MicOff, Volume2, PhoneOff } from 'lucide-react';
import { useCall } from '@/components/providers/call-provider';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function PipCallView() {
  const { isPipViewActive, activePersona, isMuted, toggleMute, endCall } = useCall();

  if (!isPipViewActive) {
    return null;
  }

  const handleEndCall = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endCall();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-background/80 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-2 p-2 border">
      
      <Link href="/voice" className="flex items-center gap-2 text-primary animate-pulse pr-2">
        <Phone className="h-5 w-5" />
        <span className="font-semibold">{activePersona || 'On Call'}</span>
      </Link>
      
      <Button variant="ghost" size="icon" className="rounded-full" onClick={toggleMute}>
        {isMuted ? <MicOff className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
      </Button>

      <Button variant="ghost" size="icon" className="rounded-full">
        <Volume2 className="h-5 w-5" />
      </Button>
      
      <Button variant="destructive" size="icon" className="rounded-full" onClick={handleEndCall}>
        <PhoneOff className="h-5 w-5" />
      </Button>
    </div>
  );
}
