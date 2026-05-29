/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  // @bya/shared is published as raw TS source; Next must transpile it.
  transpilePackages: ["@bya/shared"],
  // We use plain <img> and our own lint setup; don't fail the build on Next's lint defaults.
  eslint: { ignoreDuringBuilds: true },
  // One origin for the browser: forward /api/* to the Express backend (unchanged).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
