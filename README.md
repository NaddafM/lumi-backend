# lumi-backend-demo (local)

## What this is
A local Node.js + TypeScript WebSocket backend.
It receives a single question at a time, streams an OpenAI response back over WebSockets, and logs question and answer to Firestore.

## 1) Install dependencies
In the project folder:

npm install

## 2) Prepare Firebase
1. In Firebase Console, create or select a project.
2. Go to Project settings, Service accounts, then generate a new private key.
3. Save the JSON file locally.

Set FIREBASE_SERVICE_ACCOUNT_PATH in your .env.

## 3) Configure environment
Copy .env.example to .env and fill values.

Important env vars:
OPENAI_API_KEY
FIREBASE_SERVICE_ACCOUNT_PATH

Optional:
OPENAI_MODEL defaults to gpt-5
OPENAI_MAX_OUTPUT_TOKENS defaults to 4096

## 4) Build and run
Build:
npm run build

Run:
npm start

Server starts on ws://localhost:8787 by default.

## 5) Smoke test
In another terminal:
npm run smoke

This connects locally, sends a question, prints streaming tokens, then prints the final response.

## WebSocket protocol
Client sends:
{
  "event": "question",
  "data": {
    "requestId": "abc",
    "userText": "Hello",
    "context": { "maxOutputTokens": 4096 },
    "clientTimestamp": 1730000000000
  }
}

Client can cancel:
{
  "event": "cancel",
  "data": { "requestId": "abc" }
}

Server events:
ack, delta, done, error
