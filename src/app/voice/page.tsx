
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MicVAD, utils } from '@ricky0123/vad-web';

const WEBSOCKET_URL = "wss://voice-server-709848175384.us-central1.run.app";

type TranscriptEntry = {
  speaker: 'user' | 'ai';
  text: string;
};

export default function VoicePage() {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const vadRef = useRef<MicVAD | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
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

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 2048;
        source.connect(analyser);
        drawWaveform();

        const newVad = await MicVAD.new({
          stream: stream,
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
        
        const newSocket = new WebSocket(WEBSOCKET_URL);
        socketRef.current = newSocket;

        newSocket.onopen = () => {
          console.log('WebSocket connected.');
          newVad.start();
          setIsRecording(true);
        };
        newSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.type === 'user_transcript') {
            setTranscript(prev => [...prev, { speaker: 'user', text: data.text }]);
          } else if (data.type === 'ai_response') {
            setTranscript(prev => [...prev, { speaker: 'ai', text: data.text }]);
            if (data.audio) {
              const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
              audio.play();
            }
          }
        };
        newSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          toast({ variant: 'destructive', title: 'Connection Error' });
          stopRecording();
        };
        newSocket.onclose = () => {
          console.log('WebSocket disconnected.');
          stopRecording();
        };

        setTranscript([]);
      } catch (error) {
        console.error('Error initializing VAD:', error);
        toast({
          variant: 'destructive',
          title: 'Microphone Access Denied',
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
        {transcript.map((entry, index) => (
          <p key={index} className={cn(entry.speaker === 'user' ? 'text-right' : 'text-left')}>
            <strong>{entry.speaker === 'user' ? 'You:' : 'Shravya AI:'}</strong> {entry.text}
          </p>
        ))}
      </div>
    </div>
  );
}
