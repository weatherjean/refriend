/**
 * Tags Routes
 *
 * HTTP endpoints for hashtag discovery.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import type { CommunityDB } from "../communities/repository.ts";
import * as service from "./service.ts";
import { enrichPostsBatch } from "../posts/service.ts";
import { getCachedHashtagPosts, setCachedHashtagPosts } from "../../cache.ts";

interface TagsEnv {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createTagRoutes(): Hono<TagsEnv> {
  const routes = new Hono<TagsEnv>();

  // GET /tags/search - Search hashtags by name
  routes.get("/tags/search", async (c) => {
    const query = c.req.query("q") || "";
    const db = c.get("db");

    const tags = await service.searchTags(db, query);
    return c.json({ tags });
  });

  // GET /tags/popular - Popular tags (all-time) for sidebar
  routes.get("/tags/popular", async (c) => {
    const db = c.get("db");
    const tags = await service.getPopularTags(db);
    return c.json({ tags });
  });

  // GET /tags/trending - Trending tags (recent activity) for explore page
  routes.get("/tags/trending", async (c) => {
    const db = c.get("db");
    const tags = await service.getTrendingTags(db);
    return c.json({ tags });
  });

  // GET /tags/:tag - Get posts by hashtag
  routes.get("/tags/:tag", async (c) => {
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const actor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";

    // Try cache for logged-out users with default sort
    if (!actor && sort === "new") {
      const cached = await getCachedHashtagPosts(tag, limit, before);
      if (cached) {
        return c.json(cached);
      }
    }

    const posts = await db.getPostsByHashtagWithActor(tag, limit + 1, before, sort);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      tag,
      posts: await enrichPostsBatch(db, resultPosts, actor?.id, domain, communityDb),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users with default sort
    if (!actor && sort === "new") {
      await setCachedHashtagPosts(tag, limit, before, result);
    }

    return c.json(result);
  });

  return routes;
}
