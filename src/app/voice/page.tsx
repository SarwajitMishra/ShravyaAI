
"use client";

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useCall } from '@/components/providers/call-provider';

export default function VoicePage() {
    const { isCallActive, setIsPipViewActive, activePersona, isMuted, toggleMute, endCall } = useCall();
    const router = useRouter();

    useEffect(() => {
        // If we land on this page and there's no active call, redirect to chat.
        if (!isCallActive) {
            router.push('/chat');
        }
        // When we are on the main voice page, ensure PiP is not active.
        setIsPipViewActive(false);

        // When the component unmounts (e.g., user navigates away), activate PiP view.
        return () => {
            if (isCallActive) {
                setIsPipViewActive(true);
            }
        };
    }, [isCallActive, setIsPipViewActive, router]);

    if (!isCallActive || !activePersona) {
        return <div className="flex h-screen w-full items-center justify-center"><p>Loading call...</p></div>;
    }

    const goBackToChat = () => {
        setIsPipViewActive(true);
        router.push('/chat');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={goBackToChat}>
                <ArrowLeft className="h-6 w-6" />
            </Button>
            <p className="text-lg text-muted-foreground mb-4">You are speaking with</p>
            <h1 className="text-4xl font-bold mb-8">{activePersona}</h1>
            <div className={cn("rounded-full h-48 w-48 border-4 flex items-center justify-center transition-all duration-300", "border-primary/80 scale-105")}>
                <Mic className={cn("h-20 w-20 transition-all duration-300", "text-primary scale-110")} />
            </div>
            <p className="text-muted-foreground mt-8 animate-pulse">Live</p>
            <div className="absolute bottom-16 flex items-center gap-4">
                <Button variant={isMuted ? "destructive" : "secondary"} size="lg" className="rounded-full p-4" onClick={toggleMute}>
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <Button variant="secondary" size="lg" className="rounded-full p-4">
                    <Volume2 className="h-6 w-6" />
                </Button>
                <Button variant="destructive" size="lg" className="rounded-full" onClick={endCall}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}
