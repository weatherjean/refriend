/**
 * Tags Routes
 *
 * HTTP endpoints for hashtag discovery.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as service from "./service.ts";
import { enrichPostsBatch } from "../posts/service.ts";
import { getCachedHashtagPosts, setCachedHashtagPosts } from "../../cache.ts";
import { parseIntSafe } from "../../shared/utils.ts";
import { maybeRecalculateHashtagScores } from "../../hot-feed.ts";

interface TagsEnv {
  Variables: {
    db: DB;
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
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 10, 50);
    const tags = await service.getPopularTags(db, limit);
    return c.json({ tags });
  });

  // GET /tags/trending - Trending tags (recent activity) for explore page
  routes.get("/tags/trending", async (c) => {
    const db = c.get("db");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 10, 50);
    const tags = await service.getTrendingTags(db, limit);
    return c.json({ tags });
  });

  // GET /tags/bookmarks - List bookmarked hashtags
  routes.get("/tags/bookmarks", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const bookmarks = await service.getBookmarkedHashtags(db, actor.id);
    return c.json({ tags: bookmarks });
  });

  // GET /tags/bookmarks/feed - Paginated post feed from bookmarked hashtags
  routes.get("/tags/bookmarks/feed", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const domain = c.get("domain");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    const posts = await service.getBookmarkedFeed(db, actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: await enrichPostsBatch(db, resultPosts, actor.id, domain),
      next_cursor: nextCursor,
    });
  });

  // GET /tags/:tag/bookmark - Check if a hashtag is bookmarked
  routes.get("/tags/:tag/bookmark", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ bookmarked: false });
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    const bookmarked = await db.isHashtagBookmarked(actor.id, tag);
    return c.json({ bookmarked });
  });

  // POST /tags/:tag/bookmark - Bookmark a hashtag
  routes.post("/tags/:tag/bookmark", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    await service.bookmarkTag(db, actor.id, tag);
    return c.json({ ok: true });
  });

  // DELETE /tags/:tag/bookmark - Unbookmark a hashtag
  routes.delete("/tags/:tag/bookmark", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    await service.unbookmarkTag(db, actor.id, tag);
    return c.json({ ok: true });
  });

  // GET /tags/:tag - Get posts by hashtag
  routes.get("/tags/:tag", async (c) => {
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    const domain = c.get("domain");
    const actor = c.get("actor");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";

    // Try cache for logged-out users with default sort
    if (!actor && sort === "new") {
      const cached = await getCachedHashtagPosts(tag, limit, before);
      if (cached) {
        return c.json(cached);
      }
    }

    if (sort === "hot") {
      await maybeRecalculateHashtagScores(db, tag);
    }

    const posts = await db.getPostsByHashtagWithActor(tag, limit + 1, before, sort);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      tag,
      posts: await enrichPostsBatch(db, resultPosts, actor?.id, domain),
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
