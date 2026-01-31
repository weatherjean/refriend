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

  // GET /search/external - Search Lemmy for communities
  routes.get("/search/external", rateLimit("search"), async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Login required" }, 401);
    }

    const query = c.req.query("q") || "";
    if (!query.trim()) {
      return c.json({ communities: [] });
    }
    if (query.length > 200) {
      return c.json({ error: "Query too long" }, 400);
    }

    const baseUrl = "https://lemmy.world";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(
        `${baseUrl}/api/v3/search?q=${encodeURIComponent(query)}&type_=Communities&sort=TopAll&listing_type=All&limit=20`,
        {
          headers: { "User-Agent": "Riff/1.0" },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!res.ok) {
        return c.json({ error: `Upstream returned ${res.status}` }, 502);
      }

      const data = await res.json();
      // deno-lint-ignore no-explicit-any
      const communities = (data.communities || []).map((item: any) => ({
        name: item.community?.name ?? "",
        title: item.community?.title ?? "",
        description: item.community?.description || null,
        actor_id: item.community?.actor_id ?? "",
        icon: item.community?.icon || null,
        subscribers: item.counts?.subscribers ?? 0,
        users_active_month: item.counts?.users_active_month ?? 0,
      })).sort((a: { subscribers: number }, b: { subscribers: number }) =>
        b.subscribers - a.subscribers
      );

      return c.json({ communities });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return c.json({ error: "Upstream timeout" }, 504);
      }
      console.error("[ExternalSearch] Error:", err);
      return c.json({ error: "Failed to query external source" }, 502);
    }
  });

  return routes;
}
