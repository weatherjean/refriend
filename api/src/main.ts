import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { federation as fedifyIntegration } from "@fedify/fedify/x/hono";
import { behindProxy } from "@hongminhee/x-forwarded-fetch";
import { DB } from "./db.ts";
import { federation, setDomain, setDB } from "./domains/federation/setup.ts";
import { createApiRoutes } from "./api-routes.ts";
import { initStorage } from "./storage.ts";
import { initCache } from "./cache.ts";
import { CommunityDB } from "./domains/communities/repository.ts";
import { addCommunityFederationRoutes, setCommunityDB as setCommunityDBFed } from "./domains/communities/federation.ts";
import { setCommunityDb as setActivityCommunityDb } from "./activities.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://riff:riff@localhost:5432/riff";
const STATIC_DIR = Deno.env.get("STATIC_DIR") || "../web/dist";

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

// Global error handler - prevents crashes from unhandled errors
app.onError((err, c) => {
  console.error("[Error]", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Domain configuration - use DOMAIN env var if set, otherwise detect from request
const CONFIGURED_DOMAIN = Deno.env.get("DOMAIN");

app.use("*", async (c, next) => {
  const domain = CONFIGURED_DOMAIN || new URL(c.req.url).host;

  // Update federation domain
  setDomain(domain);
  c.set("domain", domain);

  await next();
});

// Redirect /@username to hash router profile page
// This handles mention links from ActivityPub that use our advertised profile URLs
// Must be before Fedify middleware
app.get("/:username{@.+}", async (c) => {
  const usernameWithAt = c.req.param("username");
  const username = usernameWithAt.slice(1); // Remove leading @
  const domain = new URL(c.req.url).host;

  // Check if this is a community (Group) or user (Person)
  const actor = await db.getActorByUsername(username);
  if (actor?.actor_type === "Group") {
    return c.redirect(`/#/c/${username}`);
  }
  return c.redirect(`/#/u/@${username}@${domain}`);
});

// Fedify middleware handles ActivityPub routes (including WebFinger)
app.use(fedifyIntegration(federation, () => undefined));

// Set up database reference for federation
setDB(db);

// Initialize community federation
const communityDb = new CommunityDB(db.getPool());
setCommunityDBFed(communityDb);
addCommunityFederationRoutes(app);
setActivityCommunityDb(communityDb);

// API routes for the React frontend - pass domain dynamically
app.route("/api", createApiRoutes(db, federation, communityDb));

// Health check
app.get("/health", (c) => c.json({ ok: true }));

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
  // HTML files - no cache (always revalidate to get latest asset hashes)
  else if (path.endsWith(".html") || path === "/") {
    cacheControl = "no-cache";
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

// Serve static files from web/dist (built frontend)
// Hash router handles client-side routing, so we just serve static files
app.use("/*", serveStatic({ root: STATIC_DIR }));

console.log(`Riff running on http://localhost:${PORT}`);
console.log(`Use 'ngrok http ${PORT}' to expose to the internet`);

// Use behindProxy to handle X-Forwarded-* headers from tunnel
Deno.serve({ port: PORT }, behindProxy(app.fetch));
