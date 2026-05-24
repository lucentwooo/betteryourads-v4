import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Playwright must run in the Node runtime; keep it out of the bundle trace edge.
  serverExternalPackages: ["playwright", "playwright-core"],
};
export default nextConfig;
