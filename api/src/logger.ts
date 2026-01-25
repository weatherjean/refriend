/**
 * Minimal structured logging utility
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  ts: string;
  errorId?: string;
  ctx?: Record<string, unknown>;
}

function log(
  level: LogLevel,
  message: string,
  ctx?: Record<string, unknown>,
  error?: Error
): string | undefined {
  const entry: LogEntry = {
    level,
    message,
    ts: new Date().toISOString(),
    ctx,
  };

  if (error) {
    entry.errorId = crypto.randomUUID().slice(0, 8);
    entry.ctx = { ...ctx, stack: error.stack };
  }

  const out = JSON.stringify(entry);
  if (level === "error") {
    console.error(out);
  } else if (level === "warn") {
    console.warn(out);
  } else {
    console.log(out);
  }

  return entry.errorId;
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>, err?: Error) =>
    log("error", msg, ctx, err),
};
