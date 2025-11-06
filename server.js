
// server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- Get target from environment variable ---
const targetUrl = process.env.WSS_TARGET_URL;
if (!targetUrl) {
    console.error('FATAL: WSS_TARGET_URL environment variable is not set. The proxy cannot start.');
    process.exit(1); // Exit if the target URL is not configured
}


// --- Proxy Options ---
const options = {
  target: targetUrl,
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

const app = express();

app.use('/websocket', wsProxy);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`WS proxy server listening on port ${PORT}`));
