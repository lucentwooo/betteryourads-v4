/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@bya/shared": shared } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
