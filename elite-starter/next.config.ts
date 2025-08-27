import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Enable external packages for server components
  serverExternalPackages: ['redis'],
  
  // Environment variables configuration
  env: {
    CUSTOM_KEY: 'my-value',
  },
  
  // Image optimization
  images: {
    domains: ['localhost', '127.0.0.1'],
    unoptimized: true, // For Docker compatibility
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
