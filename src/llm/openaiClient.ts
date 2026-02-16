import OpenAI from "openai";
import { Env } from "../config/env";

export type StreamCallbacks = {
  onTextDelta: (chunk: string) => void;
  onCompleted: (fullText: string, model: string) => void;
  onError: (message: string, code?: string) => void;
};

function clampTemperature(t: number): number {
  if (!Number.isFinite(t)) return 1;
  if (t < 0) return 0;
  if (t > 2) return 1;
  return t;
}

function clampMaxTokens(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 4096;
  if (max > 16384) return 16384;
  return Math.floor(max);
}

export async function streamOpenAIResponse(args: {
  env: Env;
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal: AbortSignal;
  callbacks: StreamCallbacks;
}): Promise<void> {
  const client = new OpenAI({ apiKey: args.env.OPENAI_API_KEY });

  const model = args.env.OPENAI_MODEL;
  const temperature = clampTemperature(args.temperature ?? args.env.OPENAI_TEMPERATURE);
  const maxOutputTokens = clampMaxTokens(args.maxOutputTokens ?? args.env.OPENAI_MAX_OUTPUT_TOKENS);

  let fullText = "";

  try {
    const stream = await client.responses.create(
      {
        model,
        input: [
          { role: "system", content: args.system },
          { role: "user", content: args.user }
        ],
        temperature,
        max_output_tokens: maxOutputTokens,
        stream: true
      },
      { signal: args.abortSignal }
    );

    for await (const event of stream as any) {
      if (!event || typeof event.type !== "string") continue;

      if (event.type === "response.output_text.delta") {
        const delta: string = event.delta ?? "";
        if (delta) {
          fullText += delta;
          args.callbacks.onTextDelta(delta);
        }
      }

      if (event.type === "response.completed") {
        break;
      }

      if (event.type === "error") {
        const message = event.error?.message ?? "OpenAI streaming error";
        const code = event.error?.code;
        args.callbacks.onError(message, code);
        return;
      }
    }

    args.callbacks.onCompleted(fullText, model);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      args.callbacks.onError("Request canceled by client", "canceled");
      return;
    }
    const message = err?.message ?? "OpenAI request failed";
    args.callbacks.onError(message, "openai_error");
  }
}
