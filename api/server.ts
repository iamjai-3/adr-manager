/**
 * Vercel serverless entry point.
 * Wraps the Express app so Vercel can invoke it as a serverless function.
 */
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { setupAuth } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { seedDatabase } from "../server/seed";
import { createServer } from "node:http";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

let isInitialized = false;

async function initialize() {
  if (isInitialized) return;
  await seedDatabase();
  setupAuth(app);
  await registerRoutes(createServer(app), app);
  isInitialized = true;
}

// Vercel calls this handler for every request
export default async function handler(req: express.Request, res: express.Response) {
  await initialize();
  app(req, res);
}
