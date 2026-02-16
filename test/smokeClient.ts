import WebSocket from "ws";

const url = "ws://localhost:8787";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const ws = new WebSocket(url);

  ws.on("open", async () => {
    const requestId = `smoke_${Date.now()}`;

    ws.send(
      JSON.stringify({
        event: "question",
        data: {
          requestId,
          userText: "Give me 5 points of interest near the current location and write one short sentence about each.",
          context: {
            maxOutputTokens: 1024
          },
          clientTimestamp: Date.now()
        }
      })
    );

    await sleep(2500);

    // Example cancel, comment out if you want to let it complete
    // ws.send(JSON.stringify({ event: "cancel", data: { requestId } }));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === "delta") process.stdout.write(msg.data.textChunk);
    if (msg.event === "done") {
      process.stdout.write("\n\nDONE\n");
      ws.close();
    }
    if (msg.event === "error") {
      process.stdout.write(`\nERROR: ${msg.data.message}\n`);
    }
  });

  ws.on("close", () => process.exit(0));
  ws.on("error", (e) => {
    console.error("Smoke client error:", e);
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
