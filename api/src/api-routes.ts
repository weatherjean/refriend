/**
 * Aggregated API Routes
 *
 * Mounts all domain routes with shared middleware.
 * This file provides a clean entry point that uses the new modular domain structure.
 */

import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getCookie } from "@hono/hono/cookie";
import type { Federation } from "@fedify/fedify";
import type { DB, User, Actor } from "./db.ts";
import type { CommunityDB } from "./domains/communities/repository.ts";
import { generalRateLimit } from "./middleware/rate-limit.ts";
import { csrfMiddleware } from "./middleware/csrf.ts";

// Domain routes
import { createNotificationRoutes } from "./domains/notifications/routes.ts";
import { createUserRoutes } from "./domains/users/routes.ts";
import { createSocialRoutes } from "./domains/social/routes.ts";
import { createPostRoutes } from "./domains/posts/routes.ts";
import { createCommunityRoutes } from "./domains/communities/routes.ts";
import { createTagRoutes } from "./domains/tags/routes.ts";
import { createSearchRoutes } from "./domains/search/index.ts";

type Env = {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
};

export function createApiRoutes(
  db: DB,
  federation: Federation<void>,
  communityDb: CommunityDB
): Hono<Env> {
  const api = new Hono<Env>();

  // CORS - explicit origin matching only (no wildcards)
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(o => o.trim()).filter(Boolean) ?? [];
  // Also allow the configured domain
  const configuredDomain = Deno.env.get("DOMAIN");
  if (configuredDomain) {
    allowedOrigins.push(`https://${configuredDomain}`);
    allowedOrigins.push(`http://${configuredDomain}`); // For local dev
  }

  api.use("/*", cors({
    origin: (origin) => {
      if (!origin) return null;
      // Exact match only - no wildcards for security
      if (allowedOrigins.includes(origin)) return origin;
      return null;
    },
    credentials: true,
  }));

  // General rate limiting for all API requests
  api.use("/*", generalRateLimit());

  // Inject db, domain, and session user
  api.use("/*", async (c, next) => {
    c.set("db", db);
    c.set("communityDb", communityDb);
    const domain = c.get("domain") || new URL(c.req.url).host;
    c.set("domain", domain);

    const token = getCookie(c, "session");
    if (token) {
      const session = await db.getSession(token);
      if (session) {
        const user = await db.getUserById(session.user_id);
        const actor = user ? await db.getActorByUserId(user.id) : null;
        c.set("user", user);
        c.set("actor", actor);
      } else {
        c.set("user", null);
        c.set("actor", null);
      }
    } else {
      c.set("user", null);
      c.set("actor", null);
    }

    await next();
  });

  // CSRF protection for mutation requests
  api.use("/*", csrfMiddleware);

  // ============ Mount New Domain Routes ============
  // These handle the migrated endpoints and take precedence

  // User auth and profiles: /auth/*, /users/*
  api.route("/", createUserRoutes());

  // Social interactions: /follow, /unfollow, /posts/:id/like, /posts/:id/boost, /block, /mute
  api.route("/", createSocialRoutes(federation));

  // Posts: /posts, /posts/hot, /timeline, /hashtag/:tag
  api.route("/", createPostRoutes(federation));

  // Search: /search (with remote actor lookup)
  api.route("/", createSearchRoutes(federation));

  // Notifications: /notifications/*
  api.route("/notifications", createNotificationRoutes());

  // Communities: /communities/*
  api.route("/communities", createCommunityRoutes(db, federation));

  // Tags: /tags/*
  api.route("/", createTagRoutes());

  return api;
}
