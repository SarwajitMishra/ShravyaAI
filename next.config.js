
// @ts-check

const wsProxyUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/websocket';
const wsProxyHost = new URL(wsProxyUrl).host;

// Define a separate, strict policy for PRODUCTION.
const productionSecurityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: https:",
      // This is the production-only connect-src. It allows the deployed app to connect DIRECTLY to the voice pipeline on Cloud Run.
      `connect-src 'self' https: ${wsProxyUrl.replace('ws','wss')}`,
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "upgrade-insecure-requests"
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
    // Apply different headers based on the environment.
    if (process.env.NODE_ENV === 'production') {
      // Stricter policy for production
      return [
        {
          source: '/:path*',
          headers: productionSecurityHeaders,
        },
      ];
    } else {
      // A more permissive policy for local development to allow direct connections.
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
                "style-src 'self' 'unsafe-inline' https:",
                "img-src 'self' data: https:",
                 // Allow direct WebSocket connections for development
                `connect-src 'self' https: ${wsProxyUrl}`,
                "frame-ancestors 'self'",
                "object-src 'none'",
                "base-uri 'self'",
              ].join('; ')
            }
          ],
        },
      ];
    }
  },
};

export default nextConfig;
