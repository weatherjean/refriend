/**
 * Social Routes
 *
 * HTTP endpoints for follows, likes, boosts, blocks, and mutes.
 * These routes integrate with ActivityPub federation.
 */

import { Hono } from "@hono/hono";
import {
  Announce,
  Follow,
  Like,
  Undo,
  isActor,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Federation } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import { processActivity, persistActor } from "../../activities.ts";
import * as service from "./service.ts";
import { sanitizeActor } from "../users/types.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";

interface SocialEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createSocialRoutes(federation: Federation<void>): Hono<SocialEnv> {
  const routes = new Hono<SocialEnv>();

  // ============ Follow Routes ============

  // GET /users/:username/followers
  routes.get("/users/:username/followers", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const domain = c.get("domain");

    const actor = await db.getActorByUsername(username);
    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const result = await service.getFollowers(db, actor.id, domain);
    return c.json(result);
  });

  // GET /users/:username/following
  routes.get("/users/:username/following", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const domain = c.get("domain");

    const actor = await db.getActorByUsername(username);
    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const result = await service.getFollowing(db, actor.id, domain);
    return c.json(result);
  });

  // POST /follow - Follow a user (rate limited)
  routes.post("/follow", rateLimit("follow"), async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { handle } = await c.req.json<{ handle: string }>();
    if (!handle) {
      return c.json({ error: "Handle required" }, 400);
    }

    // Parse the handle: @username@domain or username@domain or @username
    const handleMatch = handle.match(/^@?([^@]+)(?:@(.+))?$/);
    if (!handleMatch) {
      return c.json({ error: "Invalid handle format" }, 400);
    }

    const [, username, handleDomain] = handleMatch;
    const ctx = federation.createContext(c.req.raw, undefined);

    // Check if this is a local user
    const isLocalTarget = !handleDomain || handleDomain === domain || handleDomain === domain.replace(/:\d+$/, "");

    let targetActor;
    if (isLocalTarget) {
      targetActor = await db.getActorByUsername(username);
      if (!targetActor) {
        return c.json({ error: "User not found" }, 404);
      }

      if (targetActor.id === actor.id) {
        return c.json({ error: "Cannot follow yourself" }, 400);
      }
    } else {
      // Remote user: use ActivityPub lookup
      const targetAP = await ctx.lookupObject(handle);
      if (!targetAP || !isActor(targetAP)) {
        return c.json({ error: "Actor not found" }, 404);
      }

      targetActor = await persistActor(db, domain, targetAP);
      if (!targetActor) {
        return c.json({ error: "Failed to persist actor" }, 500);
      }
    }

    // Create and process the Follow activity
    const followActivity = new Follow({
      id: new URL(`https://${domain}/#follows/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(targetActor.uri),
      to: new URL(targetActor.uri),
    });

    const result = await processActivity(ctx, db, domain, followActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to follow" }, 500);
    }

    return c.json({ ok: true, message: isLocalTarget ? "Now following" : "Follow request sent" });
  });

  // POST /unfollow - Unfollow a user
  routes.post("/unfollow", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { actor_id } = await c.req.json<{ actor_id: string }>();
    const targetActor = await db.getActorByPublicId(actor_id);

    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    const followActivity = new Follow({
      id: new URL(`https://${domain}/#follows/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(targetActor.uri),
    });

    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: followActivity,
      to: new URL(targetActor.uri),
    });

    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unfollow" }, 500);
    }

    return c.json({ ok: true });
  });

  // ============ Like Routes ============

  // POST /posts/:id/like (rate limited)
  routes.post("/posts/:id/like", rateLimit("post:like"), async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    const likeActivity = new Like({
      id: new URL(`https://${domain}/#likes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    const result = await processActivity(ctx, db, domain, likeActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to like post" }, 500);
    }

    return c.json({
      ok: true,
      likes_count: await service.getLikesCount(db, post.id),
      liked: true,
    });
  });

  // DELETE /posts/:id/like
  routes.delete("/posts/:id/like", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    const likeActivity = new Like({
      id: new URL(`https://${domain}/#likes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: likeActivity,
    });

    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unlike post" }, 500);
    }

    return c.json({
      ok: true,
      likes_count: await service.getLikesCount(db, post.id),
      liked: false,
    });
  });

  // ============ Boost Routes ============

  // POST /posts/:id/boost (rate limited)
  routes.post("/posts/:id/boost", rateLimit("post:boost"), async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    if (post.actor_id === actor.id) {
      return c.json({ error: "Cannot boost your own post" }, 400);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    const announceActivity = new Announce({
      id: new URL(`https://${domain}/#announces/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(user.username),
    });

    const result = await processActivity(ctx, db, domain, announceActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to boost post" }, 500);
    }

    return c.json({
      ok: true,
      boosts_count: await service.getBoostsCount(db, post.id),
      boosted: true,
    });
  });

  // DELETE /posts/:id/boost
  routes.delete("/posts/:id/boost", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    const announceActivity = new Announce({
      id: new URL(`https://${domain}/#announces/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: announceActivity,
    });

    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unboost post" }, 500);
    }

    return c.json({
      ok: true,
      boosts_count: await service.getBoostsCount(db, post.id),
      boosted: false,
    });
  });

  // ============ Block/Mute Routes ============

  // POST /block
  routes.post("/block", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { actor_id } = await c.req.json<{ actor_id: string }>();
    const targetActor = await db.getActorByPublicId(actor_id);

    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    if (targetActor.id === actor.id) {
      return c.json({ error: "Cannot block yourself" }, 400);
    }

    await service.addBlock(db, actor.id, targetActor.id);
    return c.json({ ok: true });
  });

  // DELETE /block/:id
  routes.delete("/block/:id", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const targetId = c.req.param("id");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const targetActor = await db.getActorByPublicId(targetId);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    await service.removeBlock(db, actor.id, targetActor.id);
    return c.json({ ok: true });
  });

  // POST /mute
  routes.post("/mute", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { actor_id } = await c.req.json<{ actor_id: string }>();
    const targetActor = await db.getActorByPublicId(actor_id);

    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    if (targetActor.id === actor.id) {
      return c.json({ error: "Cannot mute yourself" }, 400);
    }

    await service.addMute(db, actor.id, targetActor.id);
    return c.json({ ok: true });
  });

  // DELETE /mute/:id
  routes.delete("/mute/:id", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const targetId = c.req.param("id");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const targetActor = await db.getActorByPublicId(targetId);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    await service.removeMute(db, actor.id, targetActor.id);
    return c.json({ ok: true });
  });

  return routes;
}
