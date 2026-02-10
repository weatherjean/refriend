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
import { generalRateLimit } from "./middleware/rate-limit.ts";
import { csrfMiddleware } from "./middleware/csrf.ts";

// Domain routes
import { isPrivateUrl } from "./domains/posts/service.ts";
import { createNotificationRoutes } from "./domains/notifications/routes.ts";
import { createUserRoutes } from "./domains/users/routes.ts";
import { createSocialRoutes } from "./domains/social/routes.ts";
import { createPostRoutes } from "./domains/posts/routes.ts";
import { createTagRoutes } from "./domains/tags/routes.ts";
import { createSearchRoutes } from "./domains/search/index.ts";
import { createFeedRoutes } from "./domains/feeds/routes.ts";
import { createStatsRoutes } from "./domains/stats/routes.ts";

// Storage for video caching
import { getCachedMedia, cacheRemoteMedia } from "./storage.ts";

type Env = {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
};

export function createApiRoutes(
  db: DB,
  federation: Federation<void>,
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

  // Track last-active updates (throttle to once per 5min per user, capped size)
  const lastActiveUpdates = new Map<number, number>();
  const LAST_ACTIVE_THROTTLE = 5 * 60 * 1000;
  const LAST_ACTIVE_MAX_ENTRIES = 10_000;
  setInterval(() => {
    const cutoff = Date.now() - LAST_ACTIVE_THROTTLE;
    for (const [id, ts] of lastActiveUpdates) {
      if (ts < cutoff) lastActiveUpdates.delete(id);
    }
  }, LAST_ACTIVE_THROTTLE);

  // Inject db, domain, and session user
  api.use("/*", async (c, next) => {
    c.set("db", db);
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

        // Throttled last_active_at update
        if (user) {
          const now = Date.now();
          const last = lastActiveUpdates.get(user.id) ?? 0;
          if (now - last > LAST_ACTIVE_THROTTLE && lastActiveUpdates.size < LAST_ACTIVE_MAX_ENTRIES) {
            lastActiveUpdates.set(user.id, now);
            db.updateUserLastActive(user.id).catch(() => {});
          }
        }
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
  api.route("/", createUserRoutes(federation));

  // Social interactions: /follow, /unfollow, /posts/:id/like, /posts/:id/boost, /block, /mute
  api.route("/", createSocialRoutes(federation));

  // Posts: /posts, /posts/hot, /timeline, /hashtag/:tag
  api.route("/", createPostRoutes(federation));

  // Search: /search (with remote actor lookup)
  api.route("/", createSearchRoutes(federation));

  // Notifications: /notifications/*
  api.route("/notifications", createNotificationRoutes());

  // Tags: /tags/*
  api.route("/", createTagRoutes());

  // Feeds: /feeds/*
  api.route("/", createFeedRoutes());

  // Stats: /stats (public, no auth)
  api.route("/", createStatsRoutes());

  // Media proxy for remote videos/images that block CORS
  // Only proxies media that failed direct loading due to CORS
  api.get("/proxy/media", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "Missing url parameter" }, 400);
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid URL" }, 400);
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return c.json({ error: "Invalid protocol" }, 400);
    }

    // Block private/internal hostnames to prevent SSRF
    if (isPrivateUrl(parsedUrl)) {
      return c.json({ error: "Private addresses not allowed" }, 400);
    }

    // Size limit: 250MB for videos
    const MAX_SIZE = 250 * 1024 * 1024;

    // Check video cache BEFORE fetching (saves bandwidth)
    // We check for any URL - if it's an image, cache miss is fine
    const cachedUrl = await getCachedMedia(url);
    if (cachedUrl) {
      return c.redirect(cachedUrl, 302);
    }

    try {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Riff/1.0)",
        },
        signal: controller.signal,
        redirect: "manual", // Don't follow redirects automatically (SSRF protection)
      });

      clearTimeout(timeout);

      // Handle redirects manually - check if redirect target is safe
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          try {
            const redirectUrl = new URL(location, url);
            if (isPrivateUrl(redirectUrl)) {
              return c.json({ error: "Redirect to private address blocked" }, 400);
            }
            // Allow redirect by returning a redirect response to client
            // Client will retry with new URL through this same proxy
            return c.json({ error: "Redirect not followed", redirect: redirectUrl.href }, 302);
          } catch {
            return c.json({ error: "Invalid redirect" }, 400);
          }
        }
      }

      if (!response.ok) {
        return c.json({ error: `Upstream error: ${response.status}` }, response.status as 400);
      }

      const contentType = response.headers.get("content-type") || "";

      // Only allow video and image types
      if (!contentType.startsWith("video/") && !contentType.startsWith("image/")) {
        return c.json({ error: "Only video and image types allowed" }, 400);
      }

      // Check content length if provided
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > MAX_SIZE) {
        return c.json({ error: "File too large (max 250MB)" }, 400);
      }

      // For videos: cache to S3 and redirect
      if (contentType.startsWith("video/")) {
        // Fetch full body for caching
        const body = await response.arrayBuffer();
        if (body.byteLength > MAX_SIZE) {
          return c.json({ error: "File too large (max 250MB)" }, 400);
        }

        // Cache to S3 and redirect
        const cached = await cacheRemoteMedia(url, new Uint8Array(body), contentType);
        return c.redirect(cached, 302);
      }

      // For images: stream directly without caching
      const reader = response.body?.getReader();
      if (!reader) {
        return c.json({ error: "No response body" }, 502);
      }

      let totalBytes = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          totalBytes += value.length;
          if (totalBytes > MAX_SIZE) {
            controller.error(new Error("Size limit exceeded"));
            reader.cancel();
            return;
          }
          controller.enqueue(value);
        },
        cancel() {
          reader.cancel();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          ...(contentLength && { "Content-Length": contentLength }),
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return c.json({ error: "Request timeout" }, 504);
      }
      console.error("[MediaProxy] Error fetching:", err);
      return c.json({ error: "Failed to fetch media" }, 502);
    }
  });

  return api;
}
