import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Docker builds a self-contained server (only the files it needs, see apps/web/Dockerfile).
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  // The monorepo root, so the standalone build also picks up the workspace packages.
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  // Security headers for every response. The Content-Security-Policy is set per request in proxy.ts.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
