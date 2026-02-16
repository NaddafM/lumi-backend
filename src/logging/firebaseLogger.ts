import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { Env } from "../config/env";
import { JsonObject } from "../core/types";

let initialized = false;

function initFirebase(env: Env): void {
  if (initialized) return;
  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set");
  }

  const servicePath = env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const absolutePath = path.isAbsolute(servicePath) ? servicePath : path.resolve(process.cwd(), servicePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Firebase service account JSON not found at: ${absolutePath}`);
  }

  const json = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(json)
  });

  initialized = true;
}

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

export async function logToFirestore(env: Env, record: LogRecord): Promise<void> {
  initFirebase(env);
  const db = admin.firestore();
  const collection = env.FIRESTORE_COLLECTION;

  await db.collection(collection).doc(record.requestId).set({
    ...record,
    createdAt: admin.firestore.Timestamp.fromMillis(record.createdAt),
    startedAt: admin.firestore.Timestamp.fromMillis(record.startedAt),
    finishedAt: admin.firestore.Timestamp.fromMillis(record.finishedAt)
  });
}
