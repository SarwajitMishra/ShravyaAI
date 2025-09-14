// server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// --- Proxy Options ---
const options = {
  target: 'wss://livevoicepipeline-m7rijrszka-uc.a.run.app',
  changeOrigin: true,
  ws: true,
  logLevel: 'debug', // Enable detailed logging from the proxy
  
  // Log errors
  onError: (err, req, res) => {
    console.error('[Proxy Error]', err);
  },

  // Log successful proxy requests
  onProxyReqWs: (proxyReq, req, socket, options, head) => {
    console.log(`[Proxy Request] Client connected, proxying to: ${options.target}`);
  },

  onOpen: (proxySocket) => {
    console.log('[Proxy Open] WebSocket connection established between proxy and target.');
  },

  onClose: (res, socket, head) => {
    console.log('[Proxy Close] Client disconnected.');
  }
};

const wsProxy = createProxyMiddleware(options);

app.use('/websocket', wsProxy);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`WS proxy server listening on port ${PORT}`));
