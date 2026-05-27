import { loadEnvFile } from "./config/index.js";
loadEnvFile(process.cwd());
import { createServer } from "./server.js";

function start(port: number, attemptsLeft: number): void {
  const app = createServer();
  const server = app.listen(port, () => {
    console.log(`\n  BetterYourAds backend running.\n  http://localhost:${port}\n`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`  Port ${port} busy, trying ${port + 1}…`);
      start(port + 1, attemptsLeft - 1);
    } else {
      console.error("  Could not start server:", err.message);
      process.exit(1);
    }
  });
}

start(Number(process.env.PORT) || 3000, 20);
