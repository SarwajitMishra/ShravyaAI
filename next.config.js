
// @ts-check

// Define a separate, strict policy for PRODUCTION.
const productionSecurityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: https:",
      // This is the production-only connect-src. No localhost.
      "connect-src 'self' https: wss://ws-proxy-709848175384.us-central1.run.app", 
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
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
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
    // ONLY apply the security headers in the PRODUCTION environment.
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/:path*',
          headers: productionSecurityHeaders,
        },
      ];
    }
    
    // For local development, return an empty array, leaving it untouched.
    return [];
  },
};

module.exports = nextConfig;
