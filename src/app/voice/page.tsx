'use client';

import { useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, MicOff, Volume2, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCall } from '@/components/providers/call-provider';

function formatElapsedTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${paddedMinutes}:${paddedSeconds}`;
}

// This component uses useSearchParams and MUST be wrapped in Suspense.
// Its only job is to parse the URL and initiate the call.
function VoiceCallInitializer() {
    const { startCall, activeCallSessionId } = useCall();
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const sessionId = searchParams?.get('sessionId');
        const persona = searchParams?.get('persona');

        if (sessionId && persona) {
            if (activeCallSessionId !== sessionId) {
                startCall(sessionId, persona, { navigate: false }); // Voice page handles its own existence.
            }
        } else {
            console.error("FATAL - No sessionId or persona found in URL. Redirecting to /chat.");
            router.push('/chat');
        }
    }, [searchParams, startCall, router, activeCallSessionId]);

    return null;
}

// This component contains the actual UI for the voice page.
function VoicePageContent() {
    const { isCallActive, connectionStatus, activePersona, isMuted, toggleMute, endCall, elapsedTime } = useCall();
    
    const renderCallStatus = () => {
        switch (connectionStatus) {
            case 'connected':
                return (
                    <>
                        <div className={cn("rounded-full h-48 w-48 border-4 flex items-center justify-center transition-all duration-300", "border-primary/80 scale-105")}>
                            <Mic className={cn("h-20 w-20 transition-all duration-300", "text-primary scale-110")} />
                        </div>
                        <p className="text-primary font-mono text-xl mt-8 animate-pulse">{formatElapsedTime(elapsedTime)}</p>
                    </>
                );
            case 'reconnecting':
                return (
                    <>
                        <div className={cn("rounded-full h-48 w-48 border-4 border-amber-500/80 flex items-center justify-center transition-all duration-300")}>
                            <Loader2 className={cn("h-20 w-20 transition-all duration-300 text-amber-500 animate-spin")} />
                        </div>
                        <p className="text-amber-500 mt-8 animate-pulse">Reconnecting...</p>
                    </>
                );
            case 'connecting':
                 return (
                    <>
                        <div className={cn("rounded-full h-48 w-48 border-4 border-muted-foreground/50 flex items-center justify-center transition-all duration-300")}>
                            <Loader2 className={cn("h-20 w-20 transition-all duration-300 text-muted-foreground animate-spin")} />
                        </div>
                        <p className="text-muted-foreground mt-8">Connecting...</p>
                    </>
                );
            case 'disconnected':
                 return (
                    <>
                        <div className={cn("rounded-full h-48 w-48 border-4 border-destructive/50 flex items-center justify-center transition-all duration-300")}>
                            <WifiOff className={cn("h-20 w-20 transition-all duration-300 text-destructive/80")} />
                        </div>
                        <p className="text-destructive mt-8">Call Ended</p>
                    </>
                );
            default:
                return null;
        }
    };
    
    if (!isCallActive && connectionStatus === 'disconnected') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
                <div className={cn("rounded-full h-48 w-48 border-4 border-destructive/50 flex items-center justify-center transition-all duration-300")}>
                    <WifiOff className={cn("h-20 w-20 transition-all duration-300 text-destructive/80")} />
                </div>
                <p className="text-destructive mt-8">Call has ended.</p>
                <p className="text-sm text-muted-foreground mt-4">You may now close this browser tab.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <p className="text-lg text-muted-foreground mb-4">You are speaking with</p>
            <h1 className="text-4xl font-bold mb-8">{activePersona || '...'}</h1>
            
            {renderCallStatus()}

            <div className="absolute bottom-16 flex items-center gap-8">
                <Button variant="secondary" size="lg" className="rounded-full p-4" disabled={!isCallActive}>
                    <Volume2 className="h-6 w-6" />
                </Button>
                <Button onClick={() => endCall({ navigateToChat: false })} variant="destructive" size="lg" className="rounded-full p-6 scale-110">
                    <PhoneOff className="h-8 w-8" />
                </Button>
                <Button variant={isMuted ? "outline" : "secondary"} size="lg" className="rounded-full p-4" onClick={toggleMute} disabled={!isCallActive}>
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
            </div>
        </div>
    );
}

export default function VoicePage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full bg-background items-center justify-center"><Loader2 className="animate-spin h-10 w-10" /></div>}>
            <VoiceCallInitializer />
            <VoicePageContent />
        </Suspense>
    );
}
