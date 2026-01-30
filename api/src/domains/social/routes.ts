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
import { persistActor, safeSendActivity } from "../federation-v2/index.ts";
import { updatePostScore } from "../../scoring.ts";
import { createNotification, removeNotification } from "../notifications/routes.ts";
import * as service from "./service.ts";
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

  // ============ Following (by type) ============

  // GET /following/people
  routes.get("/following/people", async (c) => {
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    const result = await service.getFollowingByType(db, actor.id, "Person", limit, offset, domain);
    return c.json(result);
  });

  // GET /following/communities
  routes.get("/following/communities", async (c) => {
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    const result = await service.getFollowingByType(db, actor.id, "Group", limit, offset, domain);
    return c.json(result);
  });

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

    const body = await c.req.json<{ handle?: string; actor_id?: string }>();
    const { handle, actor_id } = body;

    if (!handle && !actor_id) {
      return c.json({ error: "Handle or actor_id required" }, 400);
    }

    const ctx = federation.createContext(c.req.raw, undefined);
    let targetActor;
    let isLocalTarget = false;

    // If actor_id is provided, use it directly (preferred - avoids case sensitivity issues)
    if (actor_id) {
      targetActor = await db.getActorByPublicId(actor_id);
      if (!targetActor) {
        return c.json({ error: "Actor not found" }, 404);
      }
      // Check if local by seeing if they have a user_id
      isLocalTarget = targetActor.user_id !== null;
    } else if (handle) {
      // Fallback to handle lookup
      // Parse the handle: @username@domain or username@domain or @username
      const handleMatch = handle.match(/^@?([^@]+)(?:@(.+))?$/);
      if (!handleMatch) {
        return c.json({ error: "Invalid handle format" }, 400);
      }

      const [, username, handleDomain] = handleMatch;

      // Check if this is a local user
      isLocalTarget = !handleDomain || handleDomain === domain || handleDomain === domain.replace(/:\d+$/, "");

      if (isLocalTarget) {
        targetActor = await db.getActorByUsername(username);
        if (!targetActor) {
          return c.json({ error: "User not found" }, 404);
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
    }

    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    if (targetActor.id === actor.id) {
      return c.json({ error: "Cannot follow yourself" }, 400);
    }

    // Create the Follow activity
    const followActivity = new Follow({
      id: new URL(`https://${domain}/#follows/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(targetActor.uri),
      to: new URL(targetActor.uri),
    });

    // V2: Direct database + send pattern
    if (isLocalTarget) {
      // Local: immediately accepted
      await db.addFollow(actor.id, targetActor.id, 'accepted');
      await createNotification(db, 'follow', actor.id, targetActor.id);
      console.log(`[Follow] ${actor.handle} -> ${targetActor.handle}`);
    } else {
      // Remote: pending until Accept received
      await db.addFollow(actor.id, targetActor.id, 'pending');
      console.log(`[Follow] ${actor.handle} -> ${targetActor.handle} (pending)`);

      // Send Follow to remote actor
      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(targetActor.uri),
          inboxId: new URL(targetActor.inbox_url),
        },
        followActivity
      );
      console.log(`[Follow] Sent request to ${targetActor.handle}`);
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

    // V2: Direct database + send pattern
    await db.removeFollow(actor.id, targetActor.id);
    await removeNotification(db, 'follow', actor.id, targetActor.id);
    console.log(`[Undo Follow] ${actor.handle} unfollowed ${targetActor.handle}`);

    // Send Undo(Follow) to remote actor if not local
    if (!targetActor.user_id) {
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

      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(targetActor.uri),
          inboxId: new URL(targetActor.inbox_url),
        },
        undoActivity
      );
      console.log(`[Undo Follow] Sent to ${targetActor.handle}`);
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

    // V2: Direct database + send pattern
    await db.addLike(actor.id, post.id);
    await updatePostScore(db, post.id);
    await createNotification(db, 'like', actor.id, post.actor_id, post.id);
    console.log(`[Like] ${actor.handle} liked post ${post.id}`);

    // Send Like to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id) {
      const likeActivity = new Like({
        id: new URL(`https://${domain}/#likes/${crypto.randomUUID()}`),
        actor: ctx.getActorUri(user.username),
        object: new URL(post.uri),
      });

      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        likeActivity
      );
      console.log(`[Like] Sent to ${postAuthor.handle}`);
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

    // V2: Direct database + send pattern
    await db.removeLike(actor.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'like', actor.id, post.actor_id, post.id);
    console.log(`[Undo Like] ${actor.handle} unliked post ${post.id}`);

    // Send Undo(Like) to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id) {
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

      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        undoActivity
      );
      console.log(`[Undo Like] Sent to ${postAuthor.handle}`);
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

    // V2: Direct database + send pattern
    await db.addBoost(actor.id, post.id);
    await updatePostScore(db, post.id);
    await createNotification(db, 'boost', actor.id, post.actor_id, post.id);
    console.log(`[Announce] ${actor.handle} boosted post ${post.id}`);

    // Create Announce activity
    const announceActivity = new Announce({
      id: new URL(`https://${domain}/#announces/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(user.username),
    });

    // Send to followers
    await safeSendActivity(ctx,
      { identifier: user.username },
      "followers",
      announceActivity,
      { preferSharedInbox: true }
    );
    console.log(`[Announce] Sent to followers of ${user.username}`);

    // Also send to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        announceActivity
      );
      console.log(`[Announce] Sent to ${postAuthor.handle}`);
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

    // V2: Direct database + send pattern
    await db.removeBoost(actor.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'boost', actor.id, post.actor_id, post.id);
    console.log(`[Undo Announce] ${actor.handle} unboosted post ${post.id}`);

    // Create Undo(Announce) activity
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

    // Send to followers
    await safeSendActivity(ctx,
      { identifier: user.username },
      "followers",
      undoActivity,
      { preferSharedInbox: true }
    );
    console.log(`[Undo Announce] Sent to followers of ${user.username}`);

    // Also send to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
      await safeSendActivity(ctx,
        { identifier: user.username },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        undoActivity
      );
      console.log(`[Undo Announce] Sent to ${postAuthor.handle}`);
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
