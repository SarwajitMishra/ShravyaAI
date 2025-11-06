// @ts-check

// The URL for the WebSocket proxy, used for the live voice call feature.
const isProduction = process.env.NODE_ENV === 'production';
const wsProxyUrl = isProduction 
  ? process.env.NEXT_PUBLIC_WS_URL
  : 'ws://localhost:8080/websocket';

// The hostname is extracted to be used in the Content Security Policy.
const wsProxyHost = wsProxyUrl ? new URL(wsProxyUrl).hostname : '';

// Base security headers. These are applied in all environments.
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Allow scripts from self, inline, and eval (for development).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      // Allow styles from self and inline.
      "style-src 'self' 'unsafe-inline' https:",
      // Allow images from self, data URIs, and any HTTPS source.
      "img-src 'self' data: https:",
      // Allow WebSocket and HTTPS connections to self and the designated proxy host.
      `connect-src 'self' https: ${wsProxyUrl ? (wsProxyUrl.startsWith('ws://') ? wsProxyUrl : 'wss://' + wsProxyHost) : ''}`,
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  }
];


/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    // Apply the same security headers across all environments.
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
