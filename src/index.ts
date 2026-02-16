import "dotenv/config";
import { loadEnv } from "./config/env";
import { startWebSocketServer } from "./ws/server";

async function main(): Promise<void> {
  const env = loadEnv();
  await startWebSocketServer(env);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
