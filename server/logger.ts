const isDev = process.env.NODE_ENV !== "production";

function formatMessage(level: string, msg: string, meta?: object): string {
  if (isDev) {
    // Human-readable format for development
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${level.toUpperCase()}] ${msg}${metaStr}`;
  }
  // Structured JSON for production log aggregators
  return JSON.stringify({ level, msg, ...meta, ts: new Date().toISOString() });
}

export const logger = {
  info: (msg: string, meta?: object): void => {
    console.log(formatMessage("info", msg, meta));
  },
  warn: (msg: string, meta?: object): void => {
    console.warn(formatMessage("warn", msg, meta));
  },
  error: (msg: string, meta?: object): void => {
    console.error(formatMessage("error", msg, meta));
  },
};
