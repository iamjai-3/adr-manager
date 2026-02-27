import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { seedDatabase } from "./seed";
import { setupAuth } from "./auth";
import { logger } from "./logger";

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET", "MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Security headers ──────────────────────────────────────────────────────────
// CSP is disabled to avoid blocking Vite HMR and Excalidraw CDN assets in dev.
// Enable and configure CSP when deploying behind a CDN.
app.use(helmet({ contentSecurityPolicy: false }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// ── Auth rate limiting ────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ── Request logger ────────────────────────────────────────────────────────────
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  logger.info(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let errorMessage: string | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    // Only capture the error message from failed responses — never user data
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

(async () => {
  await seedDatabase();
  setupAuth(app);
  await registerRoutes(httpServer, app);

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = (err as { status?: number; statusCode?: number })?.status
      || (err as { statusCode?: number })?.statusCode
      || 500;
    const message = err instanceof Error ? err.message : "Internal Server Error";

    logger.error("Unhandled server error", { status, message: err instanceof Error ? err.stack : String(err) });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = Number.parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = () => {
    logger.info("Shutting down server...");
    httpServer.close(() => {
      logger.info("Server closed.");
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
