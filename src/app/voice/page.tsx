
"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, PhoneOff, ArrowLeft, MicOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useCall } from '@/components/providers/call-provider';

export default function VoicePage() {
    const { user } = useAuth();
    const { isCallActive, setIsPipViewActive, activeCallSessionId, activePersona, isMuted, toggleMute, endCall } = useCall();
    const router = useRouter();

    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    
    // Refs to hold current state values to avoid them being stale in closures
    const isCallActiveRef = useRef(isCallActive);
    const isMutedRef = useRef(isMuted);
    const isMountedRef = useRef(true);

    // Keep refs updated with the latest state
    useEffect(() => {
        isCallActiveRef.current = isCallActive;
    }, [isCallActive]);

    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    const playAudio = useCallback(async (audioBuffer: Buffer) => {
        if (!audioContextRef.current) {
            // Check for window to ensure it runs only on the client
            if (typeof window !== 'undefined') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
        }
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

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
            
            newMediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
                    const arrayBuffer = await event.data.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64Audio = buffer.toString('base64');
                    socketRef.current?.send(JSON.stringify({ event: 'audio', data: base64Audio }));
                }
            };
            
            newMediaRecorder.start(500); // Send audio chunks every 500ms
            mediaRecorderRef.current = newMediaRecorder;
        } catch (error) {
            console.error("Error accessing microphone:", error);
        }
    }, [stopRecording]);

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
        router.push('/chat');
    }, [stopRecording, endCall, router]);


    useEffect(() => {
        isMountedRef.current = true;
        setIsPipViewActive(false); // We are on the main voice page, so hide PiP

        if (!isCallActive || !user || !activeCallSessionId || !activePersona) {
            router.push('/chat');
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
                console.log("WebSocket connected");
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
                console.log("WebSocket closed");
                if (isMountedRef.current && isCallActiveRef.current) {
                    reconnectAttempts++;
                    const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, 30000);
                    console.log(`Attempting to reconnect in ${delay}ms...`);
                    setTimeout(connect, delay);
                }
            };
            
            socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                socket.close(); // This will trigger onclose and the reconnect logic
            };
        };

        connect();

        return () => {
            isMountedRef.current = false;
            if (isCallActiveRef.current) {
                setIsPipViewActive(true); // User is leaving the page but call is active
            }
            if (socketRef.current) {
                if (socketRef.current.readyState === WebSocket.OPEN) {
                   socketRef.current.send(JSON.stringify({ event: 'stop' }));
                }
                socketRef.current.close();
                socketRef.current = null;
            }
            stopRecording();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, activeCallSessionId, activePersona]); // Keep dependencies minimal to avoid re-runs
    
    // This effect handles the case where the call is ended from outside (e.g., PiP view)
    useEffect(() => {
        if (!isCallActive && socketRef.current) {
           handleEndCall();
        }
    }, [isCallActive, handleEndCall]);

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
                <Button variant="destructive" size="lg" className="rounded-full" onClick={handleEndCall}>
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Call
                </Button>
            </div>
        </div>
    );
}
