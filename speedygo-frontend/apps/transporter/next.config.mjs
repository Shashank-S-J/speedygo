/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@speedygo/types', '@speedygo/api-client', '@speedygo/ws-client', '@speedygo/three-scene'],
  images: { remotePatterns: [{ protocol: 'https', hostname: 'r2.speedygo.in' }] },
};
export default nextConfig;

