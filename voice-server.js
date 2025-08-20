
import { WebSocketServer } from 'ws';
import http from 'http';
import fetch from 'node-fetch';
import wav from 'wav';
import { Readable } from 'stream';


// Strict Production Configuration:
// These environment variables MUST be provided by the Cloud Run environment.
const { WEB_APP_URL, PORT } = process.env;

if (!WEB_APP_URL || !PORT) {
  console.error('FATAL ERROR: Missing required environment variables WEB_APP_URL or PORT.');
  process.exit(1);
}

const API_URL = `${WEB_APP_URL}/api/voice/transcribe`;
const CONVERSATIONAL_API_URL = `${WEB_APP_URL}/api/voice/conversational`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Voice-Mode WebSocket server is running.');
});

const wss = new WebSocketServer({ server });

console.log(`Voice-Mode WebSocket server starting on port ${PORT}, configured to callback to: ${WEB_APP_URL}`);

const float32To16BitPcm = (float32Arr) => {
    const pcm16 = new Int16Array(float32Arr.length);
    for (let i = 0; i < float32Arr.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Arr[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
};

const encodeWav = (samples, sampleRate) => {
    const pcmSamples = float32To16BitPcm(samples);
    const buffer = new Buffer.from(pcmSamples.buffer);
    
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    
    const wavWriter = new wav.Writer({
        sampleRate: sampleRate,
        channels: 1,
        bitDepth: 16,
    });

    const chunks = [];
    return new Promise((resolve, reject) => {
        wavWriter.on('data', chunk => chunks.push(chunk));
        wavWriter.on('end', () => resolve(Buffer.concat(chunks)));
        wavWriter.on('error', reject);
        readable.pipe(wavWriter);
    });
};

wss.on('connection', function connection(ws) {
  console.log('Client connected for a voice session.');
  let audioBuffer = [];
  let history = [];

  ws.on('message', async function message(data) {
    try {
      const message = JSON.parse(data);
      if (message.type === 'endOfSpeech') {
        console.log('End of speech detected. Processing audio...');
        
        const completeAudioBuffer = Buffer.concat(audioBuffer);
        // Assuming the incoming data is raw float32, which is what VAD provides
        const float32Array = new Float32Array(completeAudioBuffer.buffer, completeAudioBuffer.byteOffset, completeAudioBuffer.length / Float32Array.BYTES_PER_ELEMENT);
        
        const wavBuffer = await encodeWav(float32Array, 16000); // VAD default sample rate is 16000
        const base64Audio = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

        try {
            const transcribeResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioDataUri: base64Audio, languageIntent: 'Hinglish' }),
            });
            const { transcription } = await transcribeResponse.json();
            
            history.push({ role: 'user', content: transcription });
            ws.send(JSON.stringify({ type: 'user_transcript', text: transcription }));

            const convResponse = await fetch(CONVERSATIONAL_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history, persona: 'Friend' }),
            });
            const { response, audio } = await convResponse.json();

            history.push({ role: 'assistant', content: response });
            ws.send(JSON.stringify({ type: 'ai_response', text: response, audio }));

        } catch (error) {
            console.error('Error processing AI pipeline:', error);
            ws.send(JSON.stringify({ type: 'error', text: 'Sorry, there was an error processing the audio.' }));
        }

        audioBuffer = [];
      }
    } catch (error) {
      // If it's not JSON, it's audio data
      audioBuffer.push(data);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from voice session.');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT);
