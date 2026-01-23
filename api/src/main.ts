import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { federation as fedifyIntegration } from "@fedify/fedify/x/hono";
import { behindProxy } from "@hongminhee/x-forwarded-fetch";
import { DB } from "./db.ts";
import { federation, setDomain, setDB } from "./federation.ts";
import { createApi } from "./api.ts";
import { initStorage, getUploadsDir } from "./storage.ts";
import { initCache } from "./cache.ts";
import { CommunityDB } from "./communities/db.ts";
import { addCommunityFederationRoutes, setCommunityDB as setCommunityDBFed } from "./communities/federation.ts";
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

// Dynamic domain detection middleware - extracts domain from request
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const domain = url.host;

  // Update federation domain dynamically based on incoming request
  setDomain(domain);

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
app.route("/api", createApi(db, federation, communityDb));

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Serve uploaded files (avatars, etc.)
app.use("/uploads/*", serveStatic({ root: getUploadsDir(), rewriteRequestPath: (path) => path.replace("/uploads", "") }));

// Serve static files from web/dist (built frontend)
// Hash router handles client-side routing, so we just serve static files
app.use("/*", serveStatic({ root: STATIC_DIR }));

console.log(`Riff running on http://localhost:${PORT}`);
console.log(`Use 'ngrok http ${PORT}' to expose to the internet`);

// Use behindProxy to handle X-Forwarded-* headers from tunnel
Deno.serve({ port: PORT }, behindProxy(app.fetch));
