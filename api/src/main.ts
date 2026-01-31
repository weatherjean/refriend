import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { federation as fedifyIntegration } from "@fedify/hono";
import { behindProxy } from "@hongminhee/x-forwarded-fetch";

// Declare Hono context variables for TypeScript
declare module "@hono/hono" {
  interface ContextVariableMap {
    domain: string;
  }
}
import { DB } from "./db.ts";
import { federation, setDomain, setDB } from "./domains/federation-v2/setup.ts";
import { createApiRoutes } from "./api-routes.ts";
import { initStorage } from "./storage.ts";
import { initCache } from "./cache.ts";
import { logger } from "./logger.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://riff:riff@localhost:5432/riff";
const STATIC_DIR = Deno.env.get("STATIC_DIR");

// Log unhandled rejections (but let them crash in production - restart policy handles recovery)
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Rejection]", e.reason);
  // In dev, prevent crash for convenience; in prod, let it crash + auto-restart
  if (Deno.env.get("ENV") !== "production") {
    e.preventDefault();
  }
});

// Initialize database
const db = new DB(DATABASE_URL);
await db.init(new URL("../schema.pg.sql", import.meta.url).pathname);

// Initialize storage
await initStorage();

// Initialize KV cache
await initCache();

// Create Hono app
const app = new Hono();

// Security headers middleware - must be early in the chain
app.use("*", async (c, next) => {
  await next();

  // Add security headers to all responses
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // HSTS - only on production (non-localhost)
  const domain = c.get("domain") || "";
  if (!domain.startsWith("localhost")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // CSP - allow inline styles for React, but restrict scripts
  // img-src allows http: for local dev (MinIO) and federated content
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: http: blob:; " +
    "media-src 'self' https: http: blob:; " +
    "font-src 'self'; " +
    "connect-src 'self' https: http:; " +
    "frame-ancestors 'none';"
  );
});

// Global error handler - prevents crashes from unhandled errors
app.onError((err, c) => {
  const errorId = logger.error("Request error", { path: c.req.path, method: c.req.method }, err);
  return c.json({ error: "Internal server error", errorId }, 500);
});

// Domain configuration - use DOMAIN env var if set, otherwise detect from request
const CONFIGURED_DOMAIN = Deno.env.get("DOMAIN");
if (!CONFIGURED_DOMAIN && Deno.env.get("ENV") === "production") {
  console.error("FATAL: DOMAIN environment variable must be set in production");
  Deno.exit(1);
}

app.use("*", async (c, next) => {
  const domain = CONFIGURED_DOMAIN || new URL(c.req.url).host;

  // Update federation domain
  setDomain(domain);
  c.set("domain", domain);

  await next();
});

// Fedify middleware handles ActivityPub routes (including WebFinger and /@username content negotiation)
app.use(fedifyIntegration(federation, () => undefined));

// Set up database reference for federation
setDB(db);

// Start the federation queue based on NODE_TYPE:
// - unset (default): Fedify auto-starts queue (manuallyStartQueue = false)
// - "web": queue doesn't start (web-only mode)
// - "worker": we manually start queue (worker-only mode)
if (Deno.env.get("NODE_TYPE") === "worker") {
  federation.startQueue();
}

// API routes for the React frontend - pass domain dynamically
app.route("/api", createApiRoutes(db, federation));

// Health check - comprehensive check of all services
app.get("/health", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};
  let allOk = true;

  // Check database
  try {
    await db.healthCheck();
    checks.database = "ok";
  } catch (err) {
    console.error("[Health] Database check failed:", err);
    checks.database = "error";
    allOk = false;
  }

  // Check Deno KV cache
  try {
    const kvPath = Deno.env.get("DENO_KV_PATH") || undefined;
    const kv = await Deno.openKv(kvPath);
    await kv.get(["health-check"]);
    checks.cache = "ok";
  } catch (err) {
    console.error("[Health] KV cache check failed:", err);
    checks.cache = "error";
    allOk = false;
  }

  const status = allOk ? 200 : 503;
  return c.json({ ok: allOk, checks, timestamp: new Date().toISOString() }, status);
});

// Cache control middleware for static assets
app.use("/*", async (c, next) => {
  await next();

  // Only apply caching to successful static file responses
  if (c.res.status !== 200) return;

  const path = c.req.path;
  let cacheControl: string | null = null;

  // Vite-hashed assets (js, css) - cache for 1 year (immutable)
  if (path.startsWith("/assets/")) {
    cacheControl = "public, max-age=31536000, immutable";
  }
  // HTML files - never cache (always fetch fresh to get latest asset hashes)
  else if (path.endsWith(".html") || path === "/") {
    cacheControl = "no-store, no-cache, must-revalidate";
  }
  // Static files (images, fonts, manifest) - cache for 1 week
  else if (
    path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|json)$/)
  ) {
    cacheControl = "public, max-age=604800";
  }

  if (cacheControl) {
    const newHeaders = new Headers(c.res.headers);
    newHeaders.set("Cache-Control", cacheControl);
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers: newHeaders,
    });
  }
});

// Optionally serve static files (for standalone deployments without Caddy/nginx)
if (STATIC_DIR) {
  app.use("/*", serveStatic({ root: STATIC_DIR }));
}

// Graceful shutdown handling
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down...`);
  // Allow 5 seconds for in-flight requests to drain
  await new Promise((r) => setTimeout(r, 5000));
  await db.close();
  logger.info("Shutdown complete");
  Deno.exit(0);
}

Deno.addSignalListener("SIGTERM", () => shutdown("SIGTERM"));
Deno.addSignalListener("SIGINT", () => shutdown("SIGINT"));

logger.info(`Riff running on http://localhost:${PORT}`);
console.log(`Use 'ngrok http ${PORT}' to expose to the internet`);

// Use behindProxy to handle X-Forwarded-* headers from tunnel
Deno.serve({ port: PORT }, behindProxy(app.fetch));
