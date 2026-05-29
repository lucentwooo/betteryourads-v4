/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  // @bya/shared is published as raw TS source; Next must transpile it.
  transpilePackages: ["@bya/shared"],
  // We use plain <img> and our own lint setup; don't fail the build on Next's lint defaults.
  eslint: { ignoreDuringBuilds: true },
  // @bya/shared uses ESM-style .js extensions in its source imports; webpack needs to
  // resolve those to .ts files since the package ships raw TypeScript.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  // One origin for the browser: forward /api/* to the Express backend (unchanged).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
