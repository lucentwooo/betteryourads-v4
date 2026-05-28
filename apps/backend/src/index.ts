import { loadEnvFile } from "./config/index.js";
loadEnvFile(process.cwd());
import { createServer } from "./server.js";

// Deterministic port: the Vite dev proxy targets this same PORT, so silently moving to a
// different port would route the web app's /api calls to the wrong (or no) server. If the
// port is busy, fail loudly instead.
const port = Number(process.env.PORT) || 3000;
const app = createServer();
const server = app.listen(port, () => {
  console.log(`\n  BetterYourAds backend running.\n  http://localhost:${port}\n`);
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`  Port ${port} is in use. Free it, or set PORT to another value (the web proxy reads the same PORT).`);
  } else {
    console.error("  Could not start server:", err.message);
  }
  process.exit(1);
});
