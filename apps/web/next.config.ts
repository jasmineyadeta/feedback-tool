import type { NextConfig } from 'next';

const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@ft/shared', '@ft/anchoring'],
  serverExternalPackages: ['pdfjs-dist'],
  // D31: the phone never talks to Supabase directly; the app proxies /sb/* to local Supabase.
  async rewrites() {
    return [{ source: '/sb/:path*', destination: `${supabaseUrl}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
