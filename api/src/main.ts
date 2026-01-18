import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { federation as fedifyIntegration } from "@fedify/fedify/x/hono";
import { behindProxy } from "@hongminhee/x-forwarded-fetch";
import { DB } from "./db.ts";
import { federation, setDomain, setDB } from "./federation.ts";
import { createApi } from "./api.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const DB_PATH = Deno.env.get("DB_PATH") || "./data.db";
const STATIC_DIR = Deno.env.get("STATIC_DIR") || "../web/dist";

// Initialize database
const db = new DB(DB_PATH);
db.init(new URL("../schema.sql", import.meta.url).pathname);

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
    db.migrateDomain(domain);
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

// Serve static files from web/dist (built frontend)
app.use("/*", serveStatic({ root: STATIC_DIR }));

// SPA fallback - serve index.html for all unmatched routes
app.get("*", serveStatic({ path: `${STATIC_DIR}/index.html` }));

console.log(`Refriend v3 running on http://localhost:${PORT}`);
console.log(`Use 'fedify tunnel ${PORT}' to expose to the internet`);

// Use behindProxy to handle X-Forwarded-* headers from fedify tunnel
Deno.serve({ port: PORT }, behindProxy(app.fetch));
