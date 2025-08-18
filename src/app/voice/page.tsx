
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MicVAD, utils } from '@ricky0123/vad-web';

const WEBSOCKET_URL = "wss://voice-server-709848175384.us-central1.run.app";

export default function VoicePage() {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const vadRef = useRef<MicVAD | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  // Refs for audio visualization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameIdRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'hsl(var(--background))';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'hsl(var(--primary))';
      canvasCtx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };
    draw();
  };

  const stopRecording = () => {
    vadRef.current?.destroy();
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    socketRef.current?.close();
    setIsRecording(false);
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        // --- Audio Visualization Setup ---
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 2048;
        source.connect(analyser);
        drawWaveform();

        // --- VAD Setup ---
        const newVad = await MicVAD.new({
          stream: stream, // Pass the stream here
          onSpeechStart: () => setIsSpeaking(true),
          onSpeechEnd: (audio) => {
            setIsSpeaking(false);
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              const wavBuffer = utils.encodeWAV(audio);
              socketRef.current.send(wavBuffer);
              socketRef.current.send(JSON.stringify({ type: 'endOfSpeech' }));
            }
          },
        });
        vadRef.current = newVad;
        
        // --- WebSocket Setup ---
        const newSocket = new WebSocket(WEBSOCKET_URL);
        socketRef.current = newSocket;

        newSocket.onopen = () => {
          console.log('WebSocket connected to production voice server.');
          newVad.start();
          setIsRecording(true);
        };
        newSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("Received from server:", data);
          setTranscription(prev => `${prev} ${data.text}`);
        };
        newSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          toast({ variant: 'destructive', title: 'Connection Error', description: 'Could not connect to the voice service.' });
          stopRecording();
        };
        newSocket.onclose = () => {
          console.log('WebSocket disconnected.');
          stopRecording();
        };

        setTranscription('');
      } catch (error) {
        console.error('Error initializing VAD:', error);
        toast({
          variant: 'destructive',
          title: 'Microphone Access Denied',
          description: 'Please enable microphone permissions in your browser settings.',
        });
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
      <h1 className="text-4xl font-bold mb-8">Voice Mode</h1>
      
      <div className="w-64 h-32 rounded-lg border-2 border-primary flex items-center justify-center mb-8">
        {isRecording ? (
            <canvas ref={canvasRef} className="w-full h-full" />
        ) : (
            <p className="text-lg font-medium">Idle</p>
        )}
      </div>
      
      <Button
        onClick={handleToggleRecording}
        size="lg"
        className={cn(
          'w-24 h-24 rounded-full transition-all',
          isRecording ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
        )}
      >
        {isRecording ? <Square className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
      </Button>
      <p className="mt-4 text-lg font-medium">{isSpeaking ? "Speaking..." : ""}</p>

      <div className="mt-8 p-4 border rounded-lg w-full max-w-2xl min-h-[100px] bg-card text-card-foreground">
        <p className="text-sm text-muted-foreground">Transcript:</p>
        <p>{transcription}</p>
      </div>
    </div>
  );
}
