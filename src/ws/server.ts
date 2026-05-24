import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { Env } from "../config/env";
import { EnvelopeSchema, QuestionPayloadSchema, CancelPayloadSchema } from "./protocol";
import { formatNYCDateTime, nowMs } from "../utils/time";
import { buildPrompt } from "../core/promptBuilder";
import { streamOpenAIResponse } from "../llm/openaiClient";
import { logToDatastore } from "../logging/firebaseLogger";
import { loadLightingCsv, buildLightingIndex, pickRandomNtaName } from "../core/lightingData";
import { safeParseJsonArray } from "../core/jsonGuard";
import { enrichSignals } from "../core/contextEnricher";

type InFlight = {
  requestId: string;
  startedAt: number;
  abortController: AbortController;
  finalPrompt: string;
};

function safeSend(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export async function startWebSocketServer(env: Env): Promise<void> {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("lumi backend running");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  const wss = new WebSocketServer({ server });

  const lightingRows = loadLightingCsv(env.NYC_LIGHTING_CSV_PATH);
  const lightingIndex = buildLightingIndex(lightingRows);
  console.log(`Loaded lighting rows: ${lightingRows.length}`);

  let inFlight: InFlight | null = null;

  wss.on("connection", (ws) => {
    console.log("WebSocket connected");

    ws.on("pong", () => {
      (ws as any).__lastPong = nowMs();
    });

    ws.on("message", async (raw) => {
      let parsed: any;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        safeSend(ws, { event: "error", data: { message: "Invalid JSON" } });
        return;
      }

      const envRes = EnvelopeSchema.safeParse(parsed);
      if (!envRes.success) {
        safeSend(ws, { event: "error", data: { message: "Invalid envelope format" } });
        return;
      }

      const { event, data } = envRes.data;

      if (event === "cancel") {
        const cancelRes = CancelPayloadSchema.safeParse(data);
        if (!cancelRes.success) {
          safeSend(ws, { event: "error", data: { message: "Invalid cancel payload" } });
          return;
        }
        if (inFlight && inFlight.requestId === cancelRes.data.requestId) {
          inFlight.abortController.abort();
          safeSend(ws, {
            event: "ack",
            data: { requestId: cancelRes.data.requestId, serverTimestamp: nowMs() }
          });
          return;
        }
        safeSend(ws, {
          event: "error",
          data: { requestId: cancelRes.data.requestId, message: "Nothing to cancel" }
        });
        return;
      }

      if (event !== "question") {
        safeSend(ws, { event: "error", data: { message: `Unknown event: ${event}` } });
        return;
      }

      const qRes = QuestionPayloadSchema.safeParse(data);
      if (!qRes.success) {
        safeSend(ws, { event: "error", data: { message: "Invalid question payload" } });
        return;
      }

      const { requestId, userText, context } = qRes.data;

      if (inFlight) {
        safeSend(ws, {
          event: "error",
          data: { requestId, message: "Busy, one request is already running", code: "busy" }
        });
        return;
      }

      const startedAt = nowMs();
      safeSend(ws, { event: "ack", data: { requestId, serverTimestamp: startedAt } });

      const ctx = context ?? {};

      const ntaName =
        typeof ctx.ntaName === "string" && ctx.ntaName.trim().length > 0
          ? ctx.ntaName.trim()
          : pickRandomNtaName(lightingIndex);

      const lighting = lightingIndex.get(ntaName);

      const nowDate = new Date();
      const nyc = formatNYCDateTime(nowDate);

      const enriched = await enrichSignals({
        env,
        now: nowDate,
        ntaName,
        lighting,
        userLat: typeof ctx.userLat === "number" ? ctx.userLat : undefined,
        userLng: typeof ctx.userLng === "number" ? ctx.userLng : undefined,
        nycDateYYYYMMDD: nyc.date
      });

      const built = buildPrompt({
        env,
        userText,
        ctx: {
          ntaName,
          lighting,
          ageRange: ctx.ageRange,
          userGender: ctx.gender ?? null,
          visitWith: ctx.visitWith,
          cautiousness: ctx.cautiousness,
          requestedPoiCount: ctx.requestedPoiCount,
          userLat: ctx.userLat,
          userLng: ctx.userLng,
          crimeCount1km: enriched.crimeCount1km,
          weatherSummary: enriched.weatherSummary,
          isHolidayOrSpecialDay: enriched.isHolidayOrSpecialDay,
          holidayName: enriched.holidayName
        }
      });

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), env.REQUEST_TIMEOUT_MS);

      inFlight = {
        requestId,
        startedAt,
        abortController,
        finalPrompt: built.finalPromptForLogging
      };

      let finalText = "";
      let finalModel = env.OPENAI_MODEL;
      let errorObj: { message: string; code?: string } | null = null;

      await streamOpenAIResponse({
        env,
        system: built.system,
        user: built.user,
        abortSignal: abortController.signal,
        callbacks: {
          onTextDelta: (chunk) => {
            finalText += chunk;
            safeSend(ws, { event: "delta", data: { requestId, textChunk: chunk } });
          },
          onCompleted: (fullText, model) => {
            finalText = fullText;
            finalModel = model;
          },
          onError: (message, code) => {
            errorObj = { message, code };
            safeSend(ws, { event: "error", data: { requestId, message, code } });
          }
        }
      });

      clearTimeout(timeout);

      const finishedAt = nowMs();
      const latencyMs = finishedAt - startedAt;

      let pois: unknown[] | null = null;
      if (!errorObj) {
        pois = safeParseJsonArray(finalText);

        if (!pois) {
          errorObj = { message: "Model did not return valid JSON array", code: "invalid_json" };
          safeSend(ws, {
            event: "error",
            data: { requestId, message: errorObj.message, code: errorObj.code }
          });
        }
      }

      if (!errorObj && pois) {
        safeSend(ws, { event: "done", data: { requestId, pois, serverTimestamp: finishedAt } });
      }

      try {
        await logToDatastore(env, {
          requestId,
          question: userText,
          answer: pois ? JSON.stringify(pois) : finalText,
          createdAt: startedAt,
          startedAt,
          finishedAt,
          latencyMs,
          model: finalModel,
          promptVersion: env.PROMPT_VERSION,
          context: {
            ...ctx,
            selectedNtaName: ntaName,
            lighting
          },
          error: errorObj,
          finalPrompt: built.finalPromptForLogging
        });
      } catch (err: any) {
        const detail = err?.message ?? String(err);
        console.error("Firestore logging failed:", detail);
        safeSend(ws, {
          event: "error",
          data: {
            requestId,
            message: `Firestore logging failed: ${detail}`,
            code: "firestore_error"
          }
        });
      } finally {
        inFlight = null;
      }
    });

    ws.on("close", () => {
      console.log("WebSocket closed");
      if (inFlight) {
        inFlight.abortController.abort();
        inFlight = null;
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
    });
  });

  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      ws.ping();
    }
  }, env.WS_HEARTBEAT_MS);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${env.PORT}`);
  });
}
