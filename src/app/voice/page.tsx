
"use client";

import { useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useCall } from '@/components/providers/call-provider';

export default function VoicePage() {
    const { user } = useAuth();
    const { isCallActive, activeCallSessionId, activePersona, isMuted, toggleMute, endCall, connectionStatus, setConnectionStatus, forceEndCallRef } = useCall();
    const router = useRouter();

    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isCallActiveRef = useRef(isCallActive);

    useEffect(() => {
        isCallActiveRef.current = isCallActive;
    }, [isCallActive]);

    const playAudio = useCallback(async (audioData: ArrayBuffer) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioContext = audioContextRef.current;
        try {
            const buffer = await audioContext.decodeAudioData(audioData);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
        } catch (error) {
            console.error("Error decoding or playing audio:", error);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }
    }, []);

    const cleanUp = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }
        stopRecording();
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
        }
    }, [stopRecording]);

    const handleEndCall = useCallback(() => {
        endCall();
        router.push('/chat');
    }, [endCall, router]);
    
    // Assign the forceful cleanup function to the ref in the provider
    useEffect(() => {
        forceEndCallRef.current = () => {
            cleanUp();
            handleEndCall();
        }
    }, [forceEndCallRef, cleanUp, handleEndCall])

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMuted) {
                   socketRef.current?.send(JSON.stringify({ event: 'audio', data: event.data }));
                    const reader = new FileReader();
                    reader.readAsDataURL(event.data);
                    reader.onloadend = () => {
                        const base64Audio = reader.result?.toString().split(',')[1];
                        if (base64Audio) {
                            socketRef.current?.send(JSON.stringify({ event: 'audio', data: base64Audio }));
                        }
                    };
                }
            };
            recorder.start(500); // Send audio chunks every 500ms
        } catch (error) {
            console.error("Error accessing microphone:", error);
        }
    }, [isMuted]);

    useEffect(() => {
        if (!isCallActive || !user || !activeCallSessionId || !activePersona) {
            router.push('/chat');
            return;
        }

        let reconnectAttempts = 0;
        
        const connect = async () => {
            if (socketRef.current) return;
            setConnectionStatus('connecting');

            const token = await user.getIdToken();
            const websocketUrl = `${process.env.NEXT_PUBLIC_WS_URL}?token=${token}`;
            const socket = new WebSocket(websocketUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttempts = 0;
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                setConnectionStatus('connected');
                const isReconnect = reconnectAttempts > 0;
                socket.send(JSON.stringify({ event: 'start', persona: activePersona, sessionId: activeCallSessionId, isReconnect }));
                startRecording();
            };
            
            socket.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                if (msg.event === 'audio' && msg.data) {
                    const binaryString = window.atob(msg.data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    await playAudio(bytes.buffer);
                }
            };

            socket.onclose = () => {
                socketRef.current = null;
                if (isCallActiveRef.current) { // Only try to reconnect if the call is supposed to be active
                    setConnectionStatus('reconnecting');
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectAttempts++;
                    reconnectTimerRef.current = setTimeout(connect, delay);
                } else {
                    setConnectionStatus('disconnected');
                }
            };
            
            socket.onerror = (err) => {
                console.error("WebSocket error:", err);
                socket.close();
            };
        };

        connect();

        return () => {
            cleanUp();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCallActive, user, activeCallSessionId, activePersona]);
    
    if (!isCallActive || !activePersona) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="text-center">
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Loading call...</p>
                </div>
            </div>
        );
    }
    
    const renderStatus = () => {
        switch(connectionStatus) {
            case 'connected':
                return <p className="text-green-500 mt-8 animate-pulse">Live</p>;
            case 'connecting':
                return <p className="text-muted-foreground mt-8 animate-pulse">Connecting...</p>;
            case 'reconnecting':
                return <p className="text-destructive mt-8 animate-pulse">Reconnecting...</p>;
            default:
                 return <p className="text-muted-foreground mt-8">Call Ended</p>;
        }
    }
    
    const renderIcon = () => {
         switch(connectionStatus) {
            case 'connected':
                return <Mic className={cn("h-20 w-20 transition-all duration-300", "text-primary scale-110")} />;
            case 'connecting':
            case 'reconnecting':
                return <Loader2 className="h-20 w-20 animate-spin text-primary" />;
            default:
                 return <WifiOff className="h-20 w-20 text-muted-foreground" />;
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => router.push('/chat')}>
                <ArrowLeft className="h-6 w-6" />
            </Button>
            <p className="text-lg text-muted-foreground mb-4">You are speaking with</p>
            <h1 className="text-4xl font-bold mb-8">{activePersona}</h1>
            <div className={cn("rounded-full h-48 w-48 border-4 flex items-center justify-center transition-all duration-300", "border-primary/80 scale-105")}>
                {renderIcon()}
            </div>
            {renderStatus()}
            <div className="absolute bottom-16 flex items-center gap-4">
                <Button variant={isMuted ? "destructive" : "secondary"} size="lg" className="rounded-full p-4" onClick={toggleMute}>
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <Button variant="secondary" size="lg" className="rounded-full p-4">
                    <Volume2 className="h-6 w-6" />
                </Button>
                <Button variant="destructive" size="lg" className="rounded-full" onClick={handleEndCall}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}
