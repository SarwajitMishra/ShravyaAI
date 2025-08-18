
const { WebSocketServer } = require('ws');
const { transcribeAudio } = require('./src/ai/flows/transcribe-audio');

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', function connection(ws) {
  ws.on('message', async function message(data) {
    try {
      const result = await transcribeAudio({ audioChunk: data });
      ws.send(JSON.stringify(result));
    } catch (error) {
      console.error('Error transcribing audio:', error);
      ws.send(JSON.stringify({ error: 'Error transcribing audio' }));
    }
  });

  ws.send('something');
});
