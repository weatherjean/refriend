/**
 * Feeds Routes
 *
 * HTTP endpoints for user-moderated curated feeds.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import * as service from "./service.ts";
import { parseIntSafe } from "../../shared/utils.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";
import { createNotification } from "../notifications/service.ts";

const RESERVED_SLUGS = new Set([
  // Route conflicts
  "search", "discover", "moderated", "bookmarks", "new", "create", "edit",
  // Brand
  "riff", "riff-social", "riffsocial", "official", "staff", "team",
  // Admin / system
  "admin", "api", "settings", "config", "system", "internal", "root",
  "moderator", "mod", "support", "help", "abuse", "security", "legal",
  // Navigation / features
  "explore", "home", "feed", "feeds", "hot", "trending", "popular",
  "notifications", "messages", "inbox", "profile", "account", "login",
  "register", "signup", "logout", "auth", "oauth", "callback",
  // Generic reserved
  "test", "debug", "null", "undefined", "true", "false", "all", "none",
  "public", "private", "default", "about", "terms", "privacy", "rules",
]);

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface FeedsEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createFeedRoutes(): Hono<FeedsEnv> {
  const routes = new Hono<FeedsEnv>();

  // POST /feeds - Create a new feed
  routes.post("/feeds", rateLimit("feed:create"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");

    const { name, description, slug, avatar_url } = await c.req.json<{
      name: string;
      description?: string;
      slug: string;
      avatar_url?: string;
    }>();

    if (!name?.trim() || name.length > 100) {
      return c.json({ error: "Name is required (max 100 characters)" }, 400);
    }
    if (description && description.length > 500) {
      return c.json({ error: "Description too long (max 500 characters)" }, 400);
    }
    if (!slug || !/^[a-z0-9_-]+$/.test(slug) || slug.length > 60) {
      return c.json({ error: "Invalid slug (lowercase alphanumeric, hyphens, underscores, max 60 chars)" }, 400);
    }
    if (RESERVED_SLUGS.has(slug)) {
      return c.json({ error: "This slug is reserved, please choose another" }, 400);
    }

    if (avatar_url && (!isValidUrl(avatar_url) || avatar_url.length > 2048)) {
      return c.json({ error: "Invalid avatar URL" }, 400);
    }

    const feedCount = await repository.getFeedCountByOwner(db, actor.id);
    if (feedCount >= 30) {
      return c.json({ error: "You have reached the maximum of 30 feeds" }, 400);
    }

    const existing = await repository.getFeedBySlug(db, slug);
    if (existing) {
      return c.json({ error: "A feed with this slug already exists" }, 409);
    }

    try {
      const feed = await repository.createFeed(db, {
        name: name.trim(),
        description: description?.trim(),
        slug,
        avatar_url,
        owner_id: actor.id,
      });
      await repository.bookmarkFeed(db, actor.id, feed.id);
      return c.json({ feed }, 201);
    } catch (err) {
      if (err instanceof Error && err.message.includes("unique")) {
        return c.json({ error: "A feed with this slug already exists" }, 409);
      }
      throw err;
    }
  });

  // GET /feeds/search?q= - Search feeds
  routes.get("/feeds/search", async (c) => {
    const db = c.get("db");
    const query = c.req.query("q") || "";
    if (!query.trim()) {
      return c.json({ feeds: [] });
    }
    const feeds = await repository.searchFeeds(db, query);
    return c.json({ feeds });
  });

  // GET /feeds/discover - Trending + popular feeds (cached 5 min)
  routes.get("/feeds/discover", async (c) => {
    const db = c.get("db");
    const result = await service.getDiscoverFeeds(db);
    return c.json(result);
  });

  // GET /feeds/moderated - Feeds I own or moderate
  routes.get("/feeds/moderated", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const feeds = await repository.getModeratedFeeds(db, actor.id);
    return c.json({ feeds });
  });

  // GET /feeds/bookmarks - My bookmarked feeds
  routes.get("/feeds/bookmarks", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const bookmarks = await repository.getBookmarkedFeeds(db, actor.id);
    return c.json({ feeds: bookmarks });
  });

  // GET /feeds/:slug - Feed details
  routes.get("/feeds/:slug", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const slug = c.req.param("slug");
    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const bookmarked = actor ? await repository.isBookmarked(db, actor.id, feed.id) : false;
    const isOwner = actor ? feed.owner_id === actor.id : false;
    const isModerator = actor ? await repository.isModeratorOrOwner(db, feed.id, actor.id) : false;

    return c.json({ feed, bookmarked, is_owner: isOwner, is_moderator: isModerator });
  });

  // PUT /feeds/:slug - Update feed (owner only)
  routes.put("/feeds/:slug", rateLimit("feed:update"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);
    if (feed.owner_id !== actor.id) return c.json({ error: "Not authorized" }, 403);

    const { name, description, avatar_url } = await c.req.json<{
      name?: string;
      description?: string | null;
      avatar_url?: string | null;
    }>();

    if (name !== undefined && (!name.trim() || name.length > 100)) {
      return c.json({ error: "Name is required (max 100 characters)" }, 400);
    }
    if (description !== undefined && description !== null && description.length > 500) {
      return c.json({ error: "Description too long (max 500 characters)" }, 400);
    }
    if (avatar_url !== undefined && avatar_url !== null && (!isValidUrl(avatar_url) || avatar_url.length > 2048)) {
      return c.json({ error: "Invalid avatar URL" }, 400);
    }

    const updated = await repository.updateFeed(db, feed.id, { name: name?.trim(), description, avatar_url });
    return c.json({ feed: updated });
  });

  // DELETE /feeds/:slug - Delete feed (owner only)
  routes.delete("/feeds/:slug", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);
    if (feed.owner_id !== actor.id) return c.json({ error: "Not authorized" }, 403);

    await repository.deleteFeed(db, feed.id);
    return c.json({ ok: true });
  });

  // GET /feeds/:slug/posts?before=&limit= - Feed content
  routes.get("/feeds/:slug/posts", async (c) => {
    const db = c.get("db");
    const domain = c.get("domain");
    const actor = c.get("actor");
    const slug = c.req.param("slug");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const result = await service.getFeedContent(db, feed.id, limit, before, actor?.id, domain);
    return c.json(result);
  });

  // POST /feeds/:slug/posts - Add post to feed (mod/owner)
  routes.post("/feeds/:slug/posts", rateLimit("feed:addpost"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (!isMod) return c.json({ error: "Not authorized" }, 403);

    const { post_id } = await c.req.json<{ post_id: string }>();
    const post = await repository.getPostByPublicId(db, post_id);
    if (!post) return c.json({ error: "Post not found" }, 404);

    await repository.addPostToFeed(db, feed.id, post.id, actor.id);
    return c.json({ ok: true });
  });

  // DELETE /feeds/:slug/posts/:postId - Remove post from feed (mod/owner)
  routes.delete("/feeds/:slug/posts/:postId", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");
    const postId = c.req.param("postId");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (!isMod) return c.json({ error: "Not authorized" }, 403);

    const post = await repository.getPostByPublicId(db, postId);
    if (!post) return c.json({ error: "Post not found" }, 404);

    await repository.removePostFromFeed(db, feed.id, post.id);
    return c.json({ ok: true });
  });

  // POST /feeds/:slug/suggest - Suggest post (bookmarked users)
  routes.post("/feeds/:slug/suggest", rateLimit("feed:suggest"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const bookmarked = await repository.isBookmarked(db, actor.id, feed.id);
    if (!bookmarked) return c.json({ error: "You must bookmark this feed to suggest posts" }, 403);

    const { post_id } = await c.req.json<{ post_id: string }>();
    const post = await repository.getPostByPublicId(db, post_id);
    if (!post) return c.json({ error: "Post not found" }, 404);

    await repository.createSuggestion(db, feed.id, post.id, actor.id);
    return c.json({ ok: true });
  });

  // GET /feeds/:slug/suggestions - Pending suggestions (mod/owner)
  routes.get("/feeds/:slug/suggestions", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const domain = c.get("domain");
    const slug = c.req.param("slug");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (!isMod) return c.json({ error: "Not authorized" }, 403);

    const result = await service.getSuggestionContent(db, feed.id, limit, before, actor.id, domain);
    return c.json(result);
  });

  // POST /feeds/:slug/suggestions/:id/approve - Approve suggestion (mod/owner)
  routes.post("/feeds/:slug/suggestions/:id/approve", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");
    const suggestionId = parseIntSafe(c.req.param("id"));
    if (!suggestionId) return c.json({ error: "Invalid suggestion ID" }, 400);

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (!isMod) return c.json({ error: "Not authorized" }, 403);

    try {
      await service.approveSuggestion(db, suggestionId, feed.id, actor.id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("not found or already processed")
        ? err.message : "Failed to approve suggestion";
      return c.json({ error: msg }, 400);
    }
  });

  // POST /feeds/:slug/suggestions/:id/reject - Reject suggestion (mod/owner)
  routes.post("/feeds/:slug/suggestions/:id/reject", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");
    const suggestionId = parseIntSafe(c.req.param("id"));
    if (!suggestionId) return c.json({ error: "Invalid suggestion ID" }, 400);

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (!isMod) return c.json({ error: "Not authorized" }, 403);

    try {
      await service.rejectSuggestion(db, suggestionId, feed.id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("not found or already processed")
        ? err.message : "Failed to reject suggestion";
      return c.json({ error: msg }, 400);
    }
  });

  // POST /feeds/:slug/bookmark - Bookmark a feed
  routes.post("/feeds/:slug/bookmark", rateLimit("feed:bookmark"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    await repository.bookmarkFeed(db, actor.id, feed.id);
    return c.json({ ok: true });
  });

  // DELETE /feeds/:slug/bookmark - Unbookmark a feed
  routes.delete("/feeds/:slug/bookmark", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    // Prevent mods/owners from unbookmarking their own feed
    const isMod = await repository.isModeratorOrOwner(db, feed.id, actor.id);
    if (isMod) return c.json({ error: "Cannot unbookmark a feed you own or moderate" }, 403);

    await repository.unbookmarkFeed(db, actor.id, feed.id);
    return c.json({ ok: true });
  });

  // GET /feeds/:slug/moderators - List moderators (includes owner)
  routes.get("/feeds/:slug/moderators", async (c) => {
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const [moderators, owner] = await Promise.all([
      repository.getModerators(db, feed.id),
      repository.getFeedOwner(db, feed.owner_id),
    ]);
    return c.json({ moderators, owner });
  });

  // POST /feeds/:slug/moderators - Add moderator (owner only)
  routes.post("/feeds/:slug/moderators", rateLimit("feed:moderator"), async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);
    if (feed.owner_id !== actor.id) return c.json({ error: "Not authorized" }, 403);

    const { actor_id } = await c.req.json<{ actor_id: string }>();
    const targetActor = await repository.getActorByPublicId(db, actor_id);
    if (!targetActor) return c.json({ error: "Actor not found" }, 404);

    await repository.addModerator(db, feed.id, targetActor.id);
    await createNotification(db, 'feed_mod', actor.id, targetActor.id, null, feed.id);
    return c.json({ ok: true });
  });

  // DELETE /feeds/:slug/moderators/:actorId - Remove moderator (owner only)
  routes.delete("/feeds/:slug/moderators/:actorId", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json({ error: "Authentication required" }, 401);
    const db = c.get("db");
    const slug = c.req.param("slug");
    const actorPublicId = c.req.param("actorId");

    const feed = await repository.getFeedBySlug(db, slug);
    if (!feed) return c.json({ error: "Feed not found" }, 404);

    const targetActor = await repository.getActorByPublicId(db, actorPublicId);
    if (!targetActor) return c.json({ error: "Actor not found" }, 404);

    // Allow owner to remove anyone, or allow moderator to remove themselves
    const isSelfRemoval = targetActor.id === actor.id;
    if (feed.owner_id !== actor.id && !isSelfRemoval) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await repository.removeModerator(db, feed.id, targetActor.id);
    // Only notify if the owner removed them (not self-removal)
    if (!isSelfRemoval) {
      await createNotification(db, 'feed_unmod', actor.id, targetActor.id, null, feed.id);
    }
    return c.json({ ok: true });
  });

  return routes;
}
