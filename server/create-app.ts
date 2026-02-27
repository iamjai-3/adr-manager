/**
 * Creates and configures the Express application.
 * Shared between the traditional server (server/index.ts) and the
 * Vercel serverless entry point (api/server.ts).
 *
 * Does NOT call app.listen() — that is the caller's responsibility.
 */
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer, type Server } from "node:http";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { seedDatabase } from "./seed";
import { logger } from "./logger";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  logger.info(`${formattedTime} [${source}] ${message}`);
}

let _app: express.Express | null = null;
let _httpServer: Server | null = null;

export async function createApp(): Promise<{ app: express.Express; httpServer: Server }> {
  if (_app && _httpServer) return { app: _app, httpServer: _httpServer };

  const app = express();
  const httpServer = createServer(app);

  // Trust the first proxy hop (Vercel's load balancer / reverse proxy).
  // Required so that: (a) session cookies with secure:true are set correctly,
  // (b) express-rate-limit reads the real client IP from X-Forwarded-For,
  // and (c) req.protocol returns "https" behind Vercel's TLS terminator.
  app.set("trust proxy", 1);

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  // ── Auth rate limiting ────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts, please try again later." },
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);

  // ── Request logger ────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let errorMessage: string | undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      if (res.statusCode >= 400 && bodyJson && typeof bodyJson === "object") {
        errorMessage = (bodyJson as Record<string, unknown>).message as string | undefined;
      }
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        const status = res.statusCode;
        const logLine = `${req.method} ${path} ${status} in ${duration}ms${errorMessage ? ` :: ${errorMessage}` : ""}`;
        if (status >= 400) {
          logger.error(logLine);
        } else {
          logger.info(logLine);
        }
      }
    });

    next();
  });

  // ── Core setup ────────────────────────────────────────────────────────────
  await seedDatabase();
  setupAuth(app);
  await registerRoutes(httpServer, app);

  // ── Global error handler ──────────────────────────────────────────────────
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status =
      (err as { status?: number })?.status ||
      (err as { statusCode?: number })?.statusCode ||
      500;
    const message = err instanceof Error ? err.message : "Internal Server Error";
    logger.error("Unhandled server error", {
      status,
      message: err instanceof Error ? err.stack : String(err),
    });
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  _app = app;
  _httpServer = httpServer;
  return { app, httpServer };
}
