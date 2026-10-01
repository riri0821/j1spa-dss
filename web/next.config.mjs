/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev-server only (no effect on the Vercel production build) - lets the
  // browser automation tooling's local connection complete the HMR handshake
  // that client hydration depends on; without it every page stays unhydrated.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
