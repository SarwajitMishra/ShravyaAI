
import { WebSocketServer } from 'ws';
import http from 'http';
import fetch from 'node-fetch';

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
        const base64Audio = `data:audio/webm;base64,${completeAudioBuffer.toString('base64')}`;

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
