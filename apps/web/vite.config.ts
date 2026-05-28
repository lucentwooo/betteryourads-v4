/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

// Follow the backend's PORT so a non-default backend port doesn't silently break /api in dev.
const backendPort = process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@bya/shared": shared } },
  server: { proxy: { "/api": `http://localhost:${backendPort}` } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
