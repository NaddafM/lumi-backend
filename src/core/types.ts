export type JsonObject = Record<string, unknown>;

export type ClientQuestionPayload = {
  requestId: string;
  userText: string;
  context?: JsonObject;
  clientTimestamp?: number;
};

export type ClientCancelPayload = {
  requestId: string;
};

export type WsEnvelope<T> = {
  event: string;
  data: T;
};

export type ServerAck = {
  requestId: string;
  serverTimestamp: number;
};

export type ServerDelta = {
  requestId: string;
  textChunk: string;
};

export type ServerDone = {
  requestId: string;
  fullText: string;
  serverTimestamp: number;
};

export type ServerError = {
  requestId?: string;
  message: string;
  code?: string;
};
