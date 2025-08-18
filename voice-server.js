
const { WebSocketServer } = require('ws');
const http = require('http');

// Create a simple HTTP server to attach the WebSocket server to.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Voice-Mode WebSocket server is running.');
});

const wss = new WebSocketServer({ server });

console.log('Voice-Mode WebSocket server started on port 8080');

wss.on('connection', function connection(ws) {
  console.log('Client connected for a voice session.');
  let audioBuffer = [];

  ws.on('message', function message(data) {
    try {
      const message = JSON.parse(data);
      if (message.type === 'endOfSpeech') {
        console.log('End of speech detected.');
        // Here you would process the complete audioBuffer
        // For now, we'll just send back a confirmation.
        ws.send(JSON.stringify({ type: 'transcript', text: "Okay, I'm thinking..." }));
        audioBuffer = []; // Clear the buffer for the next turn
      }
    } catch (error) {
      // If it's not a JSON message, it's audio data
      audioBuffer.push(data);
      console.log(`Received audio chunk of size: ${data.length}`);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from voice session.');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(8080);
