
"use client";

import { useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useCall } from '@/components/providers/call-provider';

export default function VoicePage() {
    const { user } = useAuth();
    const { isCallActive, activeCallSessionId, activePersona, isMuted, toggleMute, endCall } = useCall();
    const router = useRouter();

    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isCallActiveRef = useRef(isCallActive);
    const isMountedRef = useRef(true); // Track component mount status

    useEffect(() => {
        isCallActiveRef.current = isCallActive;
    }, [isCallActive]);
    
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const playAudio = useCallback(async (audioBuffer: Buffer) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioContext = audioContextRef.current;
        try {
            const buffer = await audioContext.decodeAudioData(audioBuffer.buffer);
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

    const startRecording = useCallback(async () => {
        if (mediaRecorderRef.current) {
            stopRecording();
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const newMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
            newMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMuted) {
                    socketRef.current?.send(JSON.stringify({ event: 'audio', data: event.data }));
                }
            };
            newMediaRecorder.start(500); // Send audio chunks every 500ms
            mediaRecorderRef.current = newMediaRecorder;
        } catch (error) {
            console.error("Error accessing microphone:", error);
        }
    }, [isMuted, stopRecording]);

    const handleEndCall = useCallback(() => {
        if (socketRef.current) {
            if (socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ event: 'stop' }));
            }
            socketRef.current.close();
            socketRef.current = null;
        }
        stopRecording();
        endCall(); 
        // We no longer need to check isMounted here, router.push handles it.
        router.push('/chat');
    }, [stopRecording, endCall, router]);


    useEffect(() => {
        if (!isCallActive || !user || !activeCallSessionId || !activePersona) {
            if (isMountedRef.current) {
                router.push('/chat');
            }
            return;
        }

        let reconnectAttempts = 0;
        const connect = async () => {
            if (!isMountedRef.current || !isCallActiveRef.current) return;

            const token = await user.getIdToken();
            const websocketUrl = `wss://livevoicepipeline-m7rijrszka-uc.a.run.app?token=${token}`;
            const socket = new WebSocket(websocketUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttempts = 0;
                socket.send(JSON.stringify({ event: 'start', persona: activePersona, sessionId: activeCallSessionId }));
                startRecording();
            };
            
            socket.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                if (msg.event === 'audio' && msg.data) {
                    const audioBuffer = Buffer.from(msg.data, 'base64');
                    await playAudio(audioBuffer);
                }
            };

            socket.onclose = () => {
                if (isMountedRef.current && isCallActiveRef.current) {
                    reconnectAttempts++;
                    const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, 30000);
                    setTimeout(connect, delay);
                }
            };
            
            socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                socket.close();
            };
        };

        connect();

        return () => {
            handleEndCall();
        };
    }, [isCallActive, user, activeCallSessionId, activePersona, router, startRecording, playAudio, handleEndCall]);
    
    if (!isCallActive || !activePersona) {
        return <div className="flex h-screen w-full items-center justify-center"><p>Loading call...</p></div>;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => router.push('/chat')}>
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
                <Button variant="destructive" size="lg" className="rounded-full" onClick={handleEndCall}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}
