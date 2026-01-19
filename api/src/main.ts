import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { federation as fedifyIntegration } from "@fedify/fedify/x/hono";
import { behindProxy } from "@hongminhee/x-forwarded-fetch";
import { DB } from "./db.ts";
import { federation, setDomain, setDB } from "./federation.ts";
import { createApi } from "./api.ts";
import { initStorage, getUploadsDir } from "./storage.ts";
import { initCache } from "./cache.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://refriend:refriend@localhost:5432/refriend";
const STATIC_DIR = Deno.env.get("STATIC_DIR") || "../web/dist";

// Initialize database
const db = new DB(DATABASE_URL);
await db.init(new URL("../schema.pg.sql", import.meta.url).pathname);

// Initialize storage
await initStorage();

// Initialize KV cache
await initCache();

// Create Hono app
const app = new Hono();

// Track if we've migrated to a tunnel domain
let migratedDomain: string | null = null;

// Dynamic domain detection middleware - extracts domain from request
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const domain = url.host;

  // Update federation domain dynamically based on incoming request
  setDomain(domain);

  // If this is a tunnel domain (not localhost) and we haven't migrated yet, migrate the DB
  if (!domain.includes("localhost") && migratedDomain !== domain) {
    await db.migrateDomain(domain);
    migratedDomain = domain;
  }

  await next();
});

// Fedify middleware handles ActivityPub routes
app.use(fedifyIntegration(federation, () => undefined));

// Set up database reference for federation
setDB(db);

// API routes for the React frontend - pass domain dynamically
app.route("/api", createApi(db, federation));

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Serve uploaded files (avatars, etc.)
app.use("/uploads/*", serveStatic({ root: getUploadsDir(), rewriteRequestPath: (path) => path.replace("/uploads", "") }));

// Serve static files from web/dist (built frontend)
app.use("/*", serveStatic({ root: STATIC_DIR }));

// SPA fallback - serve index.html for all unmatched routes
app.get("*", serveStatic({ path: `${STATIC_DIR}/index.html` }));

console.log(`Refriend v3 running on http://localhost:${PORT}`);
console.log(`Use 'ngrok http ${PORT}' to expose to the internet`);

// Use behindProxy to handle X-Forwarded-* headers from tunnel
Deno.serve({ port: PORT }, behindProxy(app.fetch));
