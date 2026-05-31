import path from "node:path";
import type { NextConfig } from "next";

// Deploy target is a long-running Node host (Render/Docker), NOT Vercel
// serverless. `standalone` emits a self-contained server bundle we run with
// `node .next/standalone/server.js`. Playwright is kept external so Next does
// not try to bundle the Chromium driver into the server build.
//
// Large base64 image payloads to /api/* are read via `await req.json()` in the
// route handlers (App Router route handlers stream the request body and have no
// built-in body-size cap). If a fronting proxy caps request bodies, raise it
// there — there is no Next-level body-size limit to configure for route handlers.
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright"],
  // Pin the tracing root to THIS app dir. A stray lockfile in the home directory
  // makes Next infer the wrong workspace root, which breaks the standalone trace.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
