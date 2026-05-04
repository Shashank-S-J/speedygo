/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@speedygo/types', '@speedygo/api-client', '@speedygo/ws-client', '@speedygo/three-scene'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.speedygo.in' },
      { protocol: 'https', hostname: 'r2.speedygo.in' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
    NEXT_PUBLIC_STRIPE_PK: process.env.NEXT_PUBLIC_STRIPE_PK ?? '',
  },
};

export default nextConfig;

