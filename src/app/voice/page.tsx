
"use client";

import { useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useCall } from '@/components/providers/call-provider';
import { VoiceCallInitializer } from '@/components/logic/VoiceCallInitializer';

function formatElapsedTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${paddedMinutes}:${paddedSeconds}`;
}

// A simple fallback component to show while Suspense is waiting
function VoicePageContent() {
    const { isCallActive, connectionStatus, setIsPipViewActive, activePersona, isMuted, toggleMute, endCall, elapsedTime } = useCall();
    const router = useRouter(); 

    const goBackToChat = () => {
        setIsPipViewActive(true); // Explicitly enable PiP mode before navigating
        router.push('/chat');
    };

    // Automatically go back to chat if the call is ended from here
    useEffect(() => {
        if (connectionStatus === 'disconnected') {
            const timer = setTimeout(() => {
                router.push('/chat');
            }, 1500); // Wait 1.5 seconds before redirecting
            return () => clearTimeout(timer);
        }
    }, [connectionStatus, router]);


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
                return (
                     <>
                        <div className={cn("rounded-full h-48 w-48 border-4 border-muted-foreground/50 flex items-center justify-center transition-all duration-300")}>
                            <Loader2 className={cn("h-20 w-20 transition-all duration-300 text-muted-foreground animate-spin")} />
                        </div>
                        <p className="text-muted-foreground mt-8">Getting ready...</p>
                    </>
                );
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={goBackToChat}>
                <ArrowLeft className="h-6 w-6" />
            </Button>
            <p className="text-lg text-muted-foreground mb-4">You are speaking with</p>
            <h1 className="text-4xl font-bold mb-8">{activePersona || '...'}</h1>
            
            {renderCallStatus()}

            <div className="absolute bottom-16 flex items-center gap-4">
                <Button variant={isMuted ? "destructive" : "secondary"} size="lg" className="rounded-full p-4" onClick={toggleMute} disabled={!isCallActive}>
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <Button variant="secondary" size="lg" className="rounded-full p-4" disabled={!isCallActive}>
                    <Volume2 className="h-6 w-6" />
                </Button>
                <Button variant="destructive" size="lg" className="rounded-full" onClick={() => endCall(false)}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}


export default function VoicePage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>}>
            <VoiceCallInitializer />
            <VoicePageContent />
        </Suspense>
    )
}
