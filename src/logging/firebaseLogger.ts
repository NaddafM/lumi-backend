import { Datastore } from "@google-cloud/datastore";
import { Env } from "../config/env";
import { JsonObject } from "../core/types";

const datastore = new Datastore();

export type LogRecord = {
  requestId: string;
  question: string;
  answer: string;
  createdAt: number;
  startedAt: number;
  finishedAt: number;
  latencyMs: number;
  model: string;
  promptVersion: string;
  context?: JsonObject;
  error?: { message: string; code?: string } | null;
  finalPrompt?: string;
};

export async function logToDatastore(env: Env, record: LogRecord): Promise<void> {
  const kind = env.FIRESTORE_COLLECTION || "request_logs";
  const key = datastore.key([kind, record.requestId]);

  await datastore.save({
    key,
    data: [
      { name: "requestId", value: record.requestId },
      { name: "question", value: record.question, excludeFromIndexes: true },
      { name: "answer", value: record.answer, excludeFromIndexes: true },
      { name: "createdAt", value: new Date(record.createdAt) },
      { name: "startedAt", value: new Date(record.startedAt) },
      { name: "finishedAt", value: new Date(record.finishedAt) },
      { name: "latencyMs", value: record.latencyMs },
      { name: "model", value: record.model },
      { name: "promptVersion", value: record.promptVersion },
      { name: "context", value: record.context ?? null, excludeFromIndexes: true },
      { name: "error", value: record.error ?? null, excludeFromIndexes: true },
      { name: "finalPrompt", value: record.finalPrompt ?? null, excludeFromIndexes: true }
    ]
  });
}
