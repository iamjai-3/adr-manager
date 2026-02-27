/**
 * Vercel serverless entry point.
 * This file is bundled by esbuild during `npm run build` into api/server.js
 * so that all server dependencies are inlined and no TypeScript resolution
 * is needed at Vercel runtime.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/create-app";

let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

async function getHandler() {
  if (handler) return handler;
  const { app } = await createApp();
  handler = app;
  return handler;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const h = await getHandler();
  h(req, res);
}
