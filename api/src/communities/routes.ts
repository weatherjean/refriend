import { Hono } from "@hono/hono";
import type { DB, Actor, User, PostWithActor } from "../db.ts";
import type { Federation, Context } from "@fedify/fedify";
import { CommunityDB, type Community } from "./db.ts";
import { CommunityModeration } from "./moderation.ts";
import { announcePost, getCommunityActorUri } from "./federation.ts";
import { enrichPostsBatch, sanitizeActor as sanitizeActorApi } from "../api.ts";

type Env = {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    moderation: CommunityModeration;
    domain: string;
    user: User | null;
    actor: Actor | null;
    federation: Federation<void>;
  };
};

// Helper to format dates
function formatDate(date: string | Date | unknown): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (date && typeof date === "object" && "toISOString" in date) {
    return (date as Date).toISOString();
  }
  if (date) {
    const parsed = new Date(String(date));
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return String(date);
}

// Sanitize community for API response
function sanitizeCommunity(community: Community) {
  return {
    id: community.public_id,
    uri: community.uri,
    handle: community.handle,
    name: community.name,
    bio: community.bio,
    avatar_url: community.avatar_url,
    url: community.url,
    member_count: community.member_count || 0,
    require_approval: community.settings?.require_approval || false,
    created_at: formatDate(community.created_at),
  };
}

// Sanitize actor for API response
function sanitizeActor(actor: Actor, domain?: string) {
  // Check if local by comparing handle domain
  const handleDomain = actor.handle?.split('@').pop();
  const isLocal = domain ? handleDomain === domain : actor.user_id !== null;

  return {
    id: actor.public_id,
    uri: actor.uri,
    handle: actor.handle,
    name: actor.name,
    bio: actor.bio,
    avatar_url: actor.avatar_url,
    url: actor.url,
    is_local: isLocal,
    created_at: formatDate(actor.created_at),
  };
}

export function createCommunityRoutes(
  db: DB,
  federation: Federation<void>
): Hono<Env> {
  const routes = new Hono<Env>();
  const communityDb = new CommunityDB(db.getPool());
  const moderation = new CommunityModeration(communityDb);

  // Inject community DB and moderation into context
  routes.use("/*", async (c, next) => {
    c.set("communityDb", communityDb);
    c.set("moderation", moderation);
    c.set("federation", federation);
    await next();
  });

  // ============ Community CRUD ============

  // List all communities
  routes.get("/", async (c) => {
    const communityDb = c.get("communityDb");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const communities = await communityDb.listCommunities(limit + 1, before);
    const hasMore = communities.length > limit;
    const result = hasMore ? communities.slice(0, limit) : communities;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].id : null;

    return c.json({
      communities: result.map(sanitizeCommunity),
      next_cursor: nextCursor,
    });
  });

  // Search communities
  routes.get("/search", async (c) => {
    const communityDb = c.get("communityDb");
    const query = c.req.query("q") || "";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    if (!query) {
      return c.json({ communities: [] });
    }

    const communities = await communityDb.searchCommunities(query, limit);
    return c.json({
      communities: communities.map(sanitizeCommunity),
    });
  });

  // Get communities the current user has joined
  routes.get("/joined", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);

    const communities = await communityDb.getJoinedCommunities(actor.id, limit);
    return c.json({
      communities: communities.map(sanitizeCommunity),
    });
  });

  // Create a new community
  routes.post("/", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { name, bio, require_approval } = await c.req.json<{
      name: string;
      bio?: string;
      require_approval?: boolean;
    }>();

    if (!name) {
      return c.json({ error: "Community name is required" }, 400);
    }

    // Validate name format (lowercase alphanumeric and underscore)
    if (!/^[a-z0-9_]+$/.test(name) || name.length > 50) {
      return c.json({ error: "Invalid name (lowercase alphanumeric and underscore only, max 50 chars)" }, 400);
    }

    const communityDb = c.get("communityDb");
    const domain = c.get("domain");

    // Check if community already exists
    const existing = await communityDb.getCommunityByName(name);
    if (existing) {
      return c.json({ error: "Community name already taken" }, 400);
    }

    const community = await communityDb.createCommunity(name, domain, actor.id, {
      bio,
      requireApproval: require_approval,
    });

    return c.json({ community: sanitizeCommunity(community) }, 201);
  });

  // Get a specific community
  routes.get("/:name", async (c) => {
    const name = c.req.param("name");
    const communityDb = c.get("communityDb");
    const moderation = c.get("moderation");
    const actor = c.get("actor");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    let moderationInfo = null;
    if (actor) {
      moderationInfo = await moderation.getModerationInfo(community.id, actor.id);
    }

    return c.json({
      community: sanitizeCommunity(community),
      moderation: moderationInfo,
    });
  });

  // Update a community
  routes.put("/:name", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Check if user is admin
    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const updates = await c.req.json<{
      name?: string;
      bio?: string;
      avatar_url?: string;
      require_approval?: boolean;
    }>();

    const updated = await communityDb.updateCommunity(community.id, updates);
    return c.json({ community: updated ? sanitizeCommunity(updated) : null });
  });

  // Delete a community
  routes.delete("/:name", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Only owner can delete
    const isOwner = await communityDb.isOwner(community.id, actor.id);
    if (!isOwner) {
      return c.json({ error: "Owner access required" }, 403);
    }

    await communityDb.deleteCommunity(community.id);
    return c.json({ ok: true });
  });

  // ============ Membership ============

  // Join a community (follow)
  routes.post("/:name/join", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Check if banned
    const isBanned = await communityDb.isBanned(community.id, actor.id);
    if (isBanned) {
      return c.json({ error: "You are banned from this community" }, 403);
    }

    // Add follow (membership)
    await db.addFollow(actor.id, community.id);
    return c.json({ ok: true, is_member: true });
  });

  // Leave a community (unfollow)
  routes.post("/:name/leave", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Remove follow (membership)
    await db.removeFollow(actor.id, community.id);
    return c.json({ ok: true, is_member: false });
  });

  // List members
  routes.get("/:name/members", async (c) => {
    const name = c.req.param("name");
    const domain = c.get("domain");
    const communityDb = c.get("communityDb");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const members = await communityDb.getMembers(community.id, limit + 1, before);
    const hasMore = members.length > limit;
    const result = hasMore ? members.slice(0, limit) : members;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].id : null;

    return c.json({
      members: result.map(a => sanitizeActor(a, domain)),
      next_cursor: nextCursor,
    });
  });

  // ============ Admin Management ============

  // List admins
  routes.get("/:name/admins", async (c) => {
    const name = c.req.param("name");
    const domain = c.get("domain");
    const communityDb = c.get("communityDb");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const admins = await communityDb.getCommunityAdmins(community.id);
    return c.json({
      admins: admins.map((a) => ({
        id: a.id,
        role: a.role,
        actor: sanitizeActor(a.actor, domain),
        created_at: formatDate(a.created_at),
      })),
    });
  });

  // Add admin
  routes.post("/:name/admins", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { actor_id, role } = await c.req.json<{ actor_id: string; role?: "owner" | "admin" }>();
    if (!actor_id) {
      return c.json({ error: "actor_id is required" }, 400);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Only owner can add admins
    const isOwner = await communityDb.isOwner(community.id, actor.id);
    if (!isOwner) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const targetActor = await db.getActorByPublicId(actor_id);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // If demoting (setting role to admin), check if this would remove the last owner
    const targetRole = role || "admin";
    if (targetRole === "admin") {
      const currentRole = await communityDb.getAdminRole(community.id, targetActor.id);
      if (currentRole === "owner") {
        const ownerCount = await communityDb.getOwnerCount(community.id);
        if (ownerCount <= 1) {
          return c.json({ error: "Cannot demote the last owner. Promote another admin to owner first." }, 400);
        }
      }
    }

    await communityDb.addCommunityAdmin(community.id, targetActor.id, targetRole);
    return c.json({ ok: true });
  });

  // Remove admin
  routes.delete("/:name/admins/:actorId", async (c) => {
    const name = c.req.param("name");
    const actorId = c.req.param("actorId");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Only owner can remove admins
    const isOwner = await communityDb.isOwner(community.id, actor.id);
    if (!isOwner) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const targetActor = await db.getActorByPublicId(actorId);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    await communityDb.removeCommunityAdmin(community.id, targetActor.id);
    return c.json({ ok: true });
  });

  // ============ Ban Management ============

  // List bans (admin only)
  routes.get("/:name/bans", async (c) => {
    const name = c.req.param("name");
    const domain = c.get("domain");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const [bans, totalCount] = await Promise.all([
      communityDb.getCommunityBans(community.id, limit + 1, before),
      communityDb.getBanCount(community.id),
    ]);
    const hasMore = bans.length > limit;
    const result = hasMore ? bans.slice(0, limit) : bans;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].id : null;

    return c.json({
      bans: result.map((b) => ({
        id: b.id,
        actor: sanitizeActor(b.actor, domain),
        reason: b.reason,
        created_at: formatDate(b.created_at),
      })),
      total_count: totalCount,
      next_cursor: nextCursor,
    });
  });

  // Ban actor
  routes.post("/:name/bans", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { actor_id, reason } = await c.req.json<{ actor_id: string; reason?: string }>();
    if (!actor_id) {
      return c.json({ error: "actor_id is required" }, 400);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const targetActor = await db.getActorByPublicId(actor_id);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // Can't ban admins
    const targetIsAdmin = await communityDb.isAdmin(community.id, targetActor.id);
    if (targetIsAdmin) {
      return c.json({ error: "Cannot ban an admin" }, 400);
    }

    await communityDb.banActor(community.id, targetActor.id, reason || null, actor.id);
    return c.json({ ok: true });
  });

  // Unban actor
  routes.delete("/:name/bans/:actorId", async (c) => {
    const name = c.req.param("name");
    const actorId = c.req.param("actorId");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const targetActor = await db.getActorByPublicId(actorId);
    if (!targetActor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    await communityDb.unbanActor(community.id, targetActor.id);
    return c.json({ ok: true });
  });

  // ============ Community Posts ============

  // Get community posts (approved)
  routes.get("/:name/posts", async (c) => {
    const name = c.req.param("name");
    const domain = c.get("domain");
    const communityDb = c.get("communityDb");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const sort = c.req.query("sort") === "new" ? "new" : "hot"; // Default to hot

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const communityPosts = await communityDb.getCommunityPosts(community.id, "approved", limit + 1, before, sort);
    const hasMore = communityPosts.length > limit;
    const result = hasMore ? communityPosts.slice(0, limit) : communityPosts;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].post.id : null;

    // Get actors for posts
    const actorIds = [...new Set(result.map((cp) => cp.post.actor_id))];
    const actors = await db.getActorsByIds(actorIds);

    // Build PostWithActor array for enrichment
    const postsWithActors: PostWithActor[] = result.map((cp) => ({
      ...cp.post,
      author: actors.get(cp.post.actor_id)!,
    }));

    // Enrich posts with all the data PostCard needs
    const enrichedPosts = await enrichPostsBatch(db, postsWithActors, currentActor?.id, domain);

    // Add community info to each post
    const posts = enrichedPosts.map((post) => ({
      ...post,
      community: {
        id: community.public_id,
        name: community.name,
        handle: community.handle,
        avatar_url: community.avatar_url,
      },
    }));

    return c.json({
      posts,
      next_cursor: nextCursor,
    });
  });

  // Get pending posts (admin only)
  routes.get("/:name/posts/pending", async (c) => {
    const name = c.req.param("name");
    const domain = c.get("domain");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const pendingPosts = await communityDb.getCommunityPosts(community.id, "pending", limit);
    const actorIds = [...new Set(pendingPosts.map((cp) => cp.post.actor_id))];
    const actors = await db.getActorsByIds(actorIds);

    const posts = pendingPosts.map((cp) => ({
      id: cp.post.public_id,
      internal_id: cp.post.id,
      uri: cp.post.uri,
      content: cp.post.content,
      url: cp.post.url,
      sensitive: cp.post.sensitive,
      submitted_at: formatDate(cp.submitted_at),
      created_at: formatDate(cp.post.created_at),
      author: sanitizeActor(actors.get(cp.post.actor_id)!, domain),
    }));

    return c.json({ posts });
  });

  // Submit a post to the community
  routes.post("/:name/posts", async (c) => {
    const name = c.req.param("name");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { post_id } = await c.req.json<{ post_id: string }>();
    if (!post_id) {
      return c.json({ error: "post_id is required" }, 400);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");
    const moderation = c.get("moderation");
    const federation = c.get("federation");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Check if user can post
    const permission = await moderation.canPost(community.id, actor.id);
    if (!permission.allowed) {
      return c.json({ error: permission.reason }, 403);
    }

    // Get the post
    const post = await db.getPostByPublicId(post_id);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Verify post belongs to user
    if (post.actor_id !== actor.id) {
      return c.json({ error: "You can only submit your own posts" }, 403);
    }

    // Check if already submitted
    const existing = await communityDb.getCommunityPostStatus(community.id, post.id);
    if (existing) {
      return c.json({ error: "Post already submitted to this community", status: existing.status }, 400);
    }

    // Submit the post
    const autoApprove = await moderation.shouldAutoApprove(community.id, actor.id);
    const communityPost = await communityDb.submitCommunityPost(community.id, post.id, autoApprove);

    // If auto-approved, send Announce
    if (autoApprove) {
      try {
        const ctx = federation.createContext(c.req.raw);
        await announcePost(ctx, name, post.uri);
      } catch (e) {
        console.error(`[Community] Failed to announce post:`, e);
      }
    }

    return c.json({
      ok: true,
      status: communityPost.status,
      requires_approval: !autoApprove,
    });
  });

  // Approve a pending post
  routes.post("/:name/posts/:postId/approve", async (c) => {
    const name = c.req.param("name");
    const postId = c.req.param("postId");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");
    const federation = c.get("federation");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const post = await db.getPostByPublicId(postId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const communityPost = await communityDb.getCommunityPostStatus(community.id, post.id);
    if (!communityPost) {
      return c.json({ error: "Post not found in this community" }, 404);
    }

    if (communityPost.status !== "pending") {
      return c.json({ error: `Post is already ${communityPost.status}` }, 400);
    }

    await communityDb.approvePost(community.id, post.id, actor.id);

    // Send Announce
    try {
      const ctx = federation.createContext(c.req.raw);
      await announcePost(ctx, name, post.uri);
    } catch (e) {
      console.error(`[Community] Failed to announce post:`, e);
    }

    return c.json({ ok: true, status: "approved" });
  });

  // Reject a pending post
  routes.post("/:name/posts/:postId/reject", async (c) => {
    const name = c.req.param("name");
    const postId = c.req.param("postId");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const post = await db.getPostByPublicId(postId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const communityPost = await communityDb.getCommunityPostStatus(community.id, post.id);
    if (!communityPost) {
      return c.json({ error: "Post not found in this community" }, 404);
    }

    if (communityPost.status !== "pending") {
      return c.json({ error: `Post is already ${communityPost.status}` }, 400);
    }

    await communityDb.rejectPost(community.id, post.id, actor.id);
    return c.json({ ok: true, status: "rejected" });
  });

  // Remove an approved post
  routes.delete("/:name/posts/:postId", async (c) => {
    const name = c.req.param("name");
    const postId = c.req.param("postId");
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const communityDb = c.get("communityDb");
    const db = c.get("db");

    const community = await communityDb.getCommunityByName(name);
    if (!community) {
      return c.json({ error: "Community not found" }, 404);
    }

    const isAdmin = await communityDb.isAdmin(community.id, actor.id);
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const post = await db.getPostByPublicId(postId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    await communityDb.removePost(community.id, post.id);
    return c.json({ ok: true });
  });

  return routes;
}

// Export for use in other modules
export { CommunityDB, CommunityModeration };
