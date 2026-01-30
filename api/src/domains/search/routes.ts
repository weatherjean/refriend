/**
 * Search Routes
 *
 * HTTP endpoints for searching users, communities, and posts.
 * Includes remote actor lookup via ActivityPub.
 */

import { Hono } from "@hono/hono";
import type { Federation } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import { search } from "./service.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";
import { parseIntSafe } from "../../shared/utils.ts";

interface SearchEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createSearchRoutes(federation: Federation<void>): Hono<SearchEnv> {
  const routes = new Hono<SearchEnv>();

  // GET /search - Unified search endpoint (rate limited)
  routes.get("/search", rateLimit("search"), async (c) => {
    const query = c.req.query("q") || "";
    if (!query.trim()) {
      return c.json({ users: [], posts: [], postsLowConfidence: false });
    }

    // Validate query length to prevent abuse
    if (query.length > 500) {
      return c.json({ error: "Search query too long (max 500 characters)" }, 400);
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const currentUser = c.get("user");

    const type = (c.req.query("type") || "all") as "all" | "users" | "posts";
    const handleOnly = c.req.query("handleOnly") === "true";
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);

    // Create federation context for remote actor lookups
    const ctx = federation.createContext(c.req.raw, undefined);

    const result = await search(ctx, db, domain, query, {
      type,
      handleOnly,
      limit,
      currentActorId: currentActor?.id,
      currentUsername: currentUser?.username,
    });

    return c.json(result);
  });

  return routes;
}
