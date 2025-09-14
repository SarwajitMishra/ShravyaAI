"use client";

import { useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2, Loader2, WifiOff } from 'lucide-react';
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
        const sessionId = searchParams.get('sessionId');
        const persona = searchParams.get('persona');

        console.log("===== CHKPT 10: VoiceCallInitializer checking URL params. =====");

        if (sessionId && persona) {
            // Only start a new call if we are not already in that specific call.
            if (activeCallSessionId !== sessionId) {
                console.log(`===== CHKPT 11: Conditions met. Calling startCall(${sessionId}, ${persona}) =====`);
                startCall(sessionId, persona);
            }
        } else {
            // If there's no session info in the URL, we can't start a call.
            console.error("===== CHKPT 13: FATAL - No sessionId or persona found in URL. Redirecting to /chat. =====");
            router.push('/chat');
        }
        // This effect should only run once when the component mounts and searchParams are ready.
    }, [searchParams, startCall, router, activeCallSessionId]);

    // This component does not render any UI itself.
    return null;
}

// This component contains the actual UI for the voice page.
function VoicePageContent() {
    const { isCallActive, connectionStatus, setIsPipViewActive, activePersona, isMuted, toggleMute, endCall, elapsedTime } = useCall();
    const router = useRouter();

    useEffect(() => {
        // When we are on the main voice page, ensure PiP is not active.
        if (isCallActive) {
           setIsPipViewActive(false);
        }

        // When the component unmounts activate PiP view IF a call is still active.
        return () => {
            if (isCallActive) {
                setIsPipViewActive(true);
            }
        };
    }, [isCallActive, setIsPipViewActive]);

    const goBackToChat = () => {
        setIsPipViewActive(true);
        router.push('/chat');
    };

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
    
    // Fallback UI for when the call has ended or was never active.
    if (!isCallActive && connectionStatus === 'disconnected') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
                <div className={cn("rounded-full h-48 w-48 border-4 border-destructive/50 flex items-center justify-center transition-all duration-300")}>
                    <WifiOff className={cn("h-20 w-20 transition-all duration-300 text-destructive/80")} />
                </div>
                <p className="text-destructive mt-8">Call has ended.</p>
                <Button variant="secondary" className="mt-8" onClick={() => router.push('/chat')}>
                    Back to Chat
                </Button>
            </div>
        )
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
                <Button variant="destructive" size="lg" className="rounded-full" onClick={() => endCall()}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}

// The default export now correctly uses Suspense to wrap the components.
export default function VoicePage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full bg-background items-center justify-center"><Loader2 className="animate-spin h-10 w-10" /></div>}>
            <VoiceCallInitializer />
            <VoicePageContent />
        </Suspense>
    );
}
