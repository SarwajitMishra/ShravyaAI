
"use client";

import { Phone, Mic, MicOff, Volume2, PhoneOff, Loader2 } from 'lucide-react';
import { useCall } from '@/components/providers/call-provider';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function formatElapsedTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${paddedMinutes}:${paddedSeconds}`;
}

export function PipCallView() {
  const { isPipViewActive, connectionStatus, activePersona, isMuted, toggleMute, endCall, elapsedTime } = useCall();

  if (!isPipViewActive) {
    return null;
  }

  const handleEndCall = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endCall();
  };

  const renderStatusIcon = () => {
    switch(connectionStatus) {
        case 'connected':
            return <Phone className="h-5 w-5" />;
        case 'reconnecting':
            return <Loader2 className="h-5 w-5 animate-spin" />;
        default:
            return <Phone className="h-5 w-5" />;
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-background/80 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-2 p-2 border">
      
      <Link href="/voice" className="flex items-center gap-2 text-primary animate-pulse pr-2">
        {renderStatusIcon()}
        <div className="flex flex-col items-start leading-tight">
          <span className="font-semibold text-sm">{connectionStatus === 'reconnecting' ? 'Reconnecting...' : (activePersona || 'On Call')}</span>
          {connectionStatus === 'connected' && <span className="font-mono text-xs">{formatElapsedTime(elapsedTime)}</span>}
        </div>
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
