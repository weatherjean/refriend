import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getCookie, setCookie, deleteCookie } from "@hono/hono/cookie";
import {
  Announce,
  Collection,
  Create,
  Delete,
  Document,
  Follow,
  Like,
  Note,
  OrderedCollection,
  Tombstone,
  Undo,
  isActor,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Federation } from "@fedify/fedify";
import type { DB, Actor, Post, PostWithActor, User } from "./db.ts";
import type { CommunityDB } from "./communities/db.ts";
import { processActivity, persistActor } from "./activities.ts";
import { saveAvatar, saveMedia, deleteMedia } from "./storage.ts";
import {
  getCachedProfilePosts,
  setCachedProfilePosts,
  invalidateProfileCache,
  getCachedHashtagPosts,
  setCachedHashtagPosts,
  getCachedTrendingUsers,
  setCachedTrendingUsers,
} from "./cache.ts";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  deleteNotifications,
} from "./notifications.ts";
import { createCommunityRoutes } from "./communities/routes.ts";

type Env = {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
};

// Helper to format dates as ISO strings (PostgreSQL returns Date objects)
function formatDate(date: string | Date | unknown): string {
  // Handle Date objects (including from postgres driver)
  if (date instanceof Date) {
    return date.toISOString();
  }
  // Handle Date-like objects that have toISOString
  if (date && typeof date === 'object' && 'toISOString' in date && typeof (date as Date).toISOString === 'function') {
    return (date as Date).toISOString();
  }
  // Fallback - try to parse and convert
  if (date) {
    const parsed = new Date(String(date));
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return String(date);
}

export function createApi(db: DB, federation: Federation<void>, communityDb: CommunityDB) {
  const api = new Hono<Env>();

  // CORS for frontend
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") ?? [];
  api.use("/*", cors({
    origin: (origin) => {
      if (!origin) return null;
      // Allow ngrok tunnels
      if (origin.includes(".ngrok")) return origin;
      // Allow configured origins (for production)
      if (allowedOrigins.includes(origin)) return origin;
      // Reject unknown origins
      return null;
    },
    credentials: true,
  }));

  // Inject db and check session (domain comes from main.ts middleware)
  api.use("/*", async (c, next) => {
    c.set("db", db);
    c.set("communityDb", communityDb);
    // Domain is set by the middleware in main.ts, use it or fall back
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

  // ============ Auth ============

  api.post("/auth/register", async (c) => {
    const { username, password } = await c.req.json<{ username: string; password: string }>();

    if (!username || !password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    if (!/^[a-z0-9_]+$/.test(username) || username.length > 50) {
      return c.json({ error: "Invalid username (lowercase alphanumeric and underscore only)" }, 400);
    }

    const db = c.get("db");
    const domain = c.get("domain");

    if (await db.getUserByUsername(username)) {
      return c.json({ error: "Username taken" }, 400);
    }

    const passwordHash = await hashPassword(password);
    const user = await db.createUser(username, passwordHash);

    // Create actor for the user
    const actorUri = `https://${domain}/users/${username}`;
    const actor = await db.createActor({
      uri: actorUri,
      handle: `@${username}@${domain}`,
      name: null,
      bio: null,
      avatar_url: null,
      inbox_url: `https://${domain}/users/${username}/inbox`,
      shared_inbox_url: `https://${domain}/inbox`,
      url: `https://${domain}/@${username}`,
      user_id: user.id,
    });

    const token = await db.createSession(user.id);
    setCookie(c, "session", token, {
      httpOnly: true,
      secure: domain !== "localhost:8000",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return c.json({ user: sanitizeUser(user), actor: sanitizeActor(actor) });
  });

  api.post("/auth/login", async (c) => {
    const { username, password } = await c.req.json<{ username: string; password: string }>();
    const db = c.get("db");
    const domain = c.get("domain");

    const user = await db.getUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const actor = await db.getActorByUserId(user.id);
    const token = await db.createSession(user.id);
    setCookie(c, "session", token, {
      httpOnly: true,
      secure: domain !== "localhost:8000",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return c.json({ user: sanitizeUser(user), actor: actor ? sanitizeActor(actor) : null });
  });

  api.post("/auth/logout", async (c) => {
    const token = getCookie(c, "session");
    if (token) {
      await c.get("db").deleteSession(token);
      deleteCookie(c, "session");
    }
    return c.json({ ok: true });
  });

  api.get("/auth/me", (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    if (!user || !actor) {
      return c.json({ user: null, actor: null });
    }
    return c.json({ user: sanitizeUser(user), actor: sanitizeActor(actor) });
  });

  api.put("/auth/password", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const { current_password, new_password } = await c.req.json<{
      current_password: string;
      new_password: string;
    }>();

    if (!current_password || !new_password) {
      return c.json({ error: "Current and new password required" }, 400);
    }

    if (new_password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Verify current password
    const db = c.get("db");
    const fullUser = await db.getUserById(user.id);
    if (!fullUser || !(await verifyPassword(current_password, fullUser.password_hash))) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    // Update password
    const newHash = await hashPassword(new_password);
    await db.updateUserPassword(user.id, newHash);

    return c.json({ ok: true });
  });

  // ============ Profile ============

  // Trending users (most new followers in last 24h) - must be before :username route
  api.get("/users/trending", async (c) => {
    const cached = await getCachedTrendingUsers();
    if (cached) {
      return c.json(cached);
    }

    const db = c.get("db");
    const users = await db.getTrendingUsers(3);
    const result = {
      users: users.map(u => ({
        id: u.id,
        handle: u.handle,
        name: u.name,
        avatar_url: u.avatar_url,
        new_followers: u.new_followers,
      })),
    };

    await setCachedTrendingUsers(result);
    return c.json(result);
  });

  api.get("/users/:username", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if current user is following this profile
    const isFollowing = currentActor ? await db.isFollowing(currentActor.id, actor.id) : false;
    const isOwnProfile = currentActor?.id === actor.id;

    return c.json({
      actor: sanitizeActor(actor),
      stats: {
        followers: await db.getFollowersCount(actor.id),
        following: await db.getFollowingCount(actor.id),
      },
      is_following: isFollowing,
      is_own_profile: isOwnProfile,
    });
  });

  // Get posts by a specific user (local)
  // ?filter=replies to get only replies
  api.get("/users/:username/posts", async (c) => {
    const username = c.req.param("username");
    const filter = c.req.query("filter");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    // Only cache main posts (not replies) for logged-out users
    if (!filter && !currentActor) {
      const cached = await getCachedProfilePosts(actor.id, limit, before);
      if (cached) {
        return c.json(cached);
      }
    }

    // Use optimized batch methods with pagination
    const posts = filter === "replies"
      ? await db.getRepliesByActorWithActor(actor.id, limit + 1, before)
      : await db.getPostsByActorWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      posts: await enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users viewing main posts
    if (!filter && !currentActor) {
      await setCachedProfilePosts(actor.id, limit, before, result);
    }

    return c.json(result);
  });

  // Get actor by ID (works for both local and remote)
  api.get("/actors/:id", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = await db.getActorByPublicId(publicId);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    const isFollowing = currentActor ? await db.isFollowing(currentActor.id, actor.id) : false;
    const isOwnProfile = currentActor?.id === actor.id;

    return c.json({
      actor: sanitizeActor(actor),
      is_following: isFollowing,
      is_own_profile: isOwnProfile,
    });
  });

  // Get posts by actor ID (works for both local and remote)
  // ?filter=replies to get only replies
  api.get("/actors/:id/posts", async (c) => {
    const publicId = c.req.param("id");
    const filter = c.req.query("filter");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = await db.getActorByPublicId(publicId);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // Only cache main posts (not replies) for logged-out users
    if (!filter && !currentActor) {
      const cached = await getCachedProfilePosts(actor.id, limit, before);
      if (cached) {
        return c.json(cached);
      }
    }

    // Use optimized batch methods with pagination
    const posts = filter === "replies"
      ? await db.getRepliesByActorWithActor(actor.id, limit + 1, before)
      : await db.getPostsByActorWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      posts: await enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users viewing main posts
    if (!filter && !currentActor) {
      await setCachedProfilePosts(actor.id, limit, before, result);
    }

    return c.json(result);
  });

  // Get pinned posts for an actor (works for both local and remote)
  api.get("/actors/:id/pinned", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const actor = await db.getActorByPublicId(publicId);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // For local actors, return from our pinned_posts table
    if (actor.user_id !== null) {
      const posts = await db.getPinnedPostsWithActor(actor.id);
      return c.json({
        posts: await enrichPostsBatch(db, posts, currentActor?.id),
      });
    }

    // For remote actors, fetch their Featured collection
    try {
      const ctx = federation.createContext(c.req.raw, undefined);

      // Look up the remote actor to get their featured collection URL
      const remoteActor = await ctx.lookupObject(actor.uri);
      if (!remoteActor || !isActor(remoteActor)) {
        return c.json({ error: "Failed to fetch remote actor" }, 500);
      }

      // Get the featured collection URL
      const featuredUrl = remoteActor.featuredId?.href;
      if (!featuredUrl) {
        // Actor doesn't have a featured collection
        return c.json({ posts: [] });
      }

      console.log(`[Featured] Fetching featured collection: ${featuredUrl}`);

      // Fetch the featured collection
      const docLoader = ctx.documentLoader;
      const collectionDoc = await docLoader(featuredUrl);
      const collection = await OrderedCollection.fromJsonLd(collectionDoc.document, {
        documentLoader: docLoader,
        contextLoader: ctx.contextLoader,
      }) ?? await Collection.fromJsonLd(collectionDoc.document, {
        documentLoader: docLoader,
        contextLoader: ctx.contextLoader,
      });

      if (!collection) {
        console.log(`[Featured] Failed to parse collection: ${featuredUrl}`);
        return c.json({ posts: [] });
      }

      // Get items from the collection using getItems() async iterator
      const posts: Awaited<ReturnType<typeof enrichPost>>[] = [];

      for await (const item of collection.getItems()) {
        // Item might be a URL reference or an actual Note object
        let note: Note | null = null;

        if (item instanceof Note) {
          note = item;
        } else if (item instanceof URL || (item && typeof item === "object" && "href" in item)) {
          // It's a URL reference, we need to fetch the actual Note
          const noteUrl = item instanceof URL ? item.href : String(item.href);
          try {
            const noteDoc = await docLoader(noteUrl);
            note = await Note.fromJsonLd(noteDoc.document, {
              documentLoader: docLoader,
              contextLoader: ctx.contextLoader,
            });
          } catch (e) {
            console.log(`[Featured] Failed to fetch note: ${noteUrl}`, e);
            continue;
          }
        }

        if (!note) continue;

        // Try to persist this note to our database
        const noteUri = note.id?.href;
        if (!noteUri) continue;

        // Check if we already have this post
        let post = await db.getPostByUri(noteUri);
        if (!post) {
          // Get content
          const content = typeof note.content === "string"
            ? note.content
            : note.content?.toString() ?? "";

          // Get URL
          const itemUrl = note.url;
          let urlString: string | null = null;
          if (itemUrl) {
            if (itemUrl instanceof URL) {
              urlString = itemUrl.href;
            } else if (typeof itemUrl === "string") {
              urlString = itemUrl;
            } else if (itemUrl && "href" in itemUrl) {
              urlString = String(itemUrl.href);
            }
          }

          // Get original published timestamp (PostgreSQL accepts ISO format)
          const createdAt = note.published?.toString();

          // Get sensitive flag
          const sensitive = note.sensitive ?? false;

          // Create the post
          post = await db.createPost({
            uri: noteUri,
            actor_id: actor.id,
            content,
            url: urlString,
            in_reply_to_id: null,
            sensitive,
            created_at: createdAt,
          });

          // Extract attachments
          try {
            const attachments = await note.getAttachments();
            for await (const att of attachments) {
              if (att instanceof Document) {
                const attUrl = att.url;
                let attUrlString: string | null = null;
                if (attUrl instanceof URL) {
                  attUrlString = attUrl.href;
                } else if (typeof attUrl === 'string') {
                  attUrlString = attUrl;
                } else if (attUrl && 'href' in attUrl) {
                  attUrlString = String(attUrl.href);
                }

                if (attUrlString) {
                  const mediaType = att.mediaType ?? "image/jpeg";
                  const altText = typeof att.name === 'string' ? att.name : att.name?.toString() ?? null;
                  const width = att.width ?? null;
                  const height = att.height ?? null;

                  await db.createMedia(post.id, attUrlString, mediaType, altText, width, height);
                }
              }
            }
          } catch {
            // Attachments may not be present
          }

          console.log(`[Featured] Stored pinned post: ${post.id}`);
        }

        posts.push(await enrichPost(db, post, currentActor?.id));
      }

      console.log(`[Featured] Found ${posts.length} pinned posts for ${actor.handle}`);
      return c.json({ posts });
    } catch (err) {
      console.error(`[Featured] Error fetching featured collection:`, err);
      return c.json({ posts: [] });
    }
  });

  // Get boosted posts for an actor (local only - remote boosts not exposed via AP)
  api.get("/actors/:id/boosts", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = await db.getActorByPublicId(publicId);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // Only local actors have boost data
    if (actor.user_id === null) {
      return c.json({ posts: [], next_cursor: null });
    }

    const posts = await db.getBoostedPostsWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: await enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    });
  });

  // ============ Posts ============

  api.get("/posts", async (c) => {
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const actor = c.get("actor");
    const timeline = c.req.query("timeline") || "public";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    // Use optimized batch methods with actor JOIN and pagination
    const posts = timeline === "home" && actor
      ? await db.getHomeFeedWithActor(actor.id, limit + 1, before)
      : await db.getPublicTimelineWithActor(limit + 1, before);

    // Check if there are more posts
    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    // Enrich posts with standard data
    const enrichedPosts = await enrichPostsBatch(db, resultPosts, actor?.id);

    // For home timeline, add community info to posts
    if (timeline === "home" && communityDb) {
      const postIds = resultPosts.map(p => p.id);
      const communitiesMap = await communityDb.getCommunitiesForPosts(postIds);

      // Add community info to posts that belong to communities
      const postsWithCommunities = enrichedPosts.map((post, index) => {
        const community = communitiesMap.get(resultPosts[index].id);
        if (community) {
          return {
            ...post,
            community: {
              id: community.public_id,
              name: community.name,
              handle: community.handle,
              avatar_url: community.avatar_url,
            },
          };
        }
        return post;
      });

      return c.json({
        posts: postsWithCommunities,
        next_cursor: nextCursor,
      });
    }

    return c.json({
      posts: enrichedPosts,
      next_cursor: nextCursor,
    });
  });

  // GET /posts/hot - Get posts sorted by hot score
  api.get("/posts/hot", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "10"), 20);

    const posts = await db.getHotPosts(limit);

    return c.json({
      posts: await enrichPostsBatch(db, posts, actor?.id),
    });
  });

  // POST /posts - Create post via ActivityPub Create activity
  api.post("/posts", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const domain = c.get("domain");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    interface AttachmentInput {
      url: string;
      alt_text?: string;
      width: number;
      height: number;
    }

    const { content, in_reply_to, attachments, sensitive } = await c.req.json<{
      content: string;
      in_reply_to?: string;  // UUID/public_id
      attachments?: AttachmentInput[];
      sensitive?: boolean;
    }>();

    if (!content?.trim()) {
      return c.json({ error: "Content required" }, 400);
    }

    // Content length limit (500 chars like Mastodon)
    if (content.length > 500) {
      return c.json({ error: "Content too long (max 500 characters)" }, 400);
    }

    // Validate attachments (max 4)
    if (attachments && attachments.length > 4) {
      return c.json({ error: "Maximum 4 attachments allowed" }, 400);
    }

    // Check if replying to a valid post (in_reply_to is a UUID/public_id)
    let replyToPost = null;
    if (in_reply_to) {
      replyToPost = await db.getPostByPublicId(in_reply_to);
      if (!replyToPost) {
        return c.json({ error: "Parent post not found" }, 404);
      }

      // Check if the parent post belongs to a community and if user is banned
      const communityDb = c.get("communityDb");
      const community = await communityDb.getCommunityForPost(replyToPost.id);
      if (community) {
        const isBanned = await communityDb.isBanned(community.id, actor.id);
        if (isBanned) {
          return c.json({ error: "You are banned from this community" }, 403);
        }
      }
    }

    // Escape HTML
    const safeContent = `<p>${escapeHtml(content)}</p>`;

    const ctx = federation.createContext(c.req.raw, undefined);

    // Generate a unique ID for this note
    const noteId = crypto.randomUUID();
    const noteUri = `https://${domain}/users/${user.username}/posts/${noteId}`;
    const noteUrl = `https://${domain}/@${user.username}/posts/${noteId}`;

    // Build attachments for ActivityPub Note
    const noteAttachments = (attachments ?? []).map(att => new Document({
      url: new URL(`https://${domain}${att.url}`),
      mediaType: "image/webp",
      name: att.alt_text ?? null,
      width: att.width,
      height: att.height,
    }));

    // Create the Note
    const note = new Note({
      id: new URL(noteUri),
      attribution: ctx.getActorUri(user.username),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(user.username),
      content: safeContent,
      url: new URL(noteUrl),
      published: Temporal.Now.instant(),
      replyTarget: replyToPost ? new URL(replyToPost.uri) : undefined,
      attachments: noteAttachments.length > 0 ? noteAttachments : undefined,
      sensitive: sensitive ?? false,
    });

    // Create the activity
    const createActivity = new Create({
      id: new URL(`${noteUri}#activity`),
      actor: ctx.getActorUri(user.username),
      object: note,
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(user.username),
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, createActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to create post" }, 500);
    }

    // Retrieve the created post
    const post = await db.getPostByUri(noteUri);
    if (!post) {
      return c.json({ error: "Post not found after creation" }, 500);
    }

    // Note: Media records are created by processCreate from the Note attachments
    // No need to create them here again

    // Invalidate the author's profile cache
    await invalidateProfileCache(actor.id);

    return c.json({ post: await enrichPost(db, post, actor?.id) });
  });

  api.get("/posts/:id", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const actor = c.get("actor");
    const post = await db.getPostByPublicId(publicId);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Get ancestor chain (walk up in_reply_to_id)
    const ancestors: Awaited<ReturnType<typeof enrichPost>>[] = [];
    let currentPost = post;
    const seen = new Set<number>([post.id]); // Prevent infinite loops

    while (currentPost.in_reply_to_id) {
      const parentPost = await db.getPostById(currentPost.in_reply_to_id);
      if (!parentPost || seen.has(parentPost.id)) break;
      seen.add(parentPost.id);
      ancestors.unshift(await enrichPost(db, parentPost, actor?.id));
      currentPost = parentPost;
    }

    return c.json({ post: await enrichPost(db, post, actor?.id), ancestors });
  });

  api.get("/posts/:id/replies", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const actor = c.get("actor");
    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const after = c.req.query("after") ? parseInt(c.req.query("after")!) : undefined;

    // Use optimized batch method with pagination (replies use "after" since they're ASC)
    const replies = await db.getRepliesWithActor(post.id, limit + 1, after);

    const hasMore = replies.length > limit;
    const resultReplies = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore && resultReplies.length > 0
      ? resultReplies[resultReplies.length - 1].id
      : null;

    return c.json({
      replies: await enrichPostsBatch(db, resultReplies, actor?.id),
      next_cursor: nextCursor,
    });
  });

  // DELETE /posts/:id - Delete post via ActivityPub Delete activity
  api.delete("/posts/:id", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post || post.actor_id !== actor.id) {
      return c.json({ error: "Not found or unauthorized" }, 404);
    }

    // Get media files before deleting (CASCADE will delete DB records)
    const mediaFiles = await db.getMediaByPostId(post.id);

    const ctx = federation.createContext(c.req.raw, undefined);

    // Create the Delete activity
    const deleteActivity = new Delete({
      id: new URL(`https://${domain}/#deletes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new Tombstone({
        id: new URL(post.uri),
      }),
      to: PUBLIC_COLLECTION,
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, deleteActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to delete post" }, 500);
    }

    // Clean up local media files from disk
    for (const media of mediaFiles) {
      // Only delete local uploads (not remote URLs)
      if (media.url.startsWith('/uploads/media/')) {
        const filename = media.url.replace('/uploads/media/', '');
        await deleteMedia(filename);
      }
    }

    // Invalidate the author's profile cache
    await invalidateProfileCache(actor.id);

    return c.json({ ok: true });
  });

  // ============ Likes ============

  // POST /posts/:id/like - Like a post via ActivityPub Like activity
  api.post("/posts/:id/like", async (c) => {
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

    // Create the Like activity
    const likeActivity = new Like({
      id: new URL(`https://${domain}/#likes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, likeActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to like post" }, 500);
    }

    return c.json({
      ok: true,
      likes_count: await db.getLikesCount(post.id),
      liked: true,
    });
  });

  // DELETE /posts/:id/like - Unlike a post via ActivityPub Undo(Like) activity
  api.delete("/posts/:id/like", async (c) => {
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

    // Create the Like activity to undo
    const likeActivity = new Like({
      id: new URL(`https://${domain}/#likes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    // Create the Undo activity
    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: likeActivity,
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unlike post" }, 500);
    }

    return c.json({
      ok: true,
      likes_count: await db.getLikesCount(post.id),
      liked: false,
    });
  });

  // POST /posts/:id/boost - Boost a post via ActivityPub Announce activity
  api.post("/posts/:id/boost", async (c) => {
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

    // Can't boost your own post
    if (post.actor_id === actor.id) {
      return c.json({ error: "Cannot boost your own post" }, 400);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    // Create the Announce activity
    const announceActivity = new Announce({
      id: new URL(`https://${domain}/#announces/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
      to: PUBLIC_COLLECTION,
      cc: ctx.getFollowersUri(user.username),
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, announceActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to boost post" }, 500);
    }

    return c.json({
      ok: true,
      boosts_count: await db.getBoostsCount(post.id),
      boosted: true,
    });
  });

  // DELETE /posts/:id/boost - Unboost a post via ActivityPub Undo(Announce) activity
  api.delete("/posts/:id/boost", async (c) => {
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

    // Create the Announce activity to undo
    const announceActivity = new Announce({
      id: new URL(`https://${domain}/#announces/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(post.uri),
    });

    // Create the Undo activity
    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: announceActivity,
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unboost post" }, 500);
    }

    return c.json({
      ok: true,
      boosts_count: await db.getBoostsCount(post.id),
      boosted: false,
    });
  });

  // POST /posts/:id/pin - Pin a post to profile
  api.post("/posts/:id/pin", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Can only pin your own posts
    if (post.actor_id !== actor.id) {
      return c.json({ error: "Cannot pin another user's post" }, 403);
    }

    // Limit to 5 pinned posts
    const pinnedCount = await db.getPinnedPostsCount(actor.id);
    if (pinnedCount >= 5 && !(await db.isPinned(actor.id, post.id))) {
      return c.json({ error: "Cannot pin more than 5 posts" }, 400);
    }

    await db.pinPost(actor.id, post.id);
    return c.json({ ok: true, pinned: true });
  });

  // DELETE /posts/:id/pin - Unpin a post from profile
  api.delete("/posts/:id/pin", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    await db.unpinPost(actor.id, post.id);
    return c.json({ ok: true, pinned: false });
  });

  // GET /users/:username/pinned - Get pinned posts for a user
  api.get("/users/:username/pinned", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = await db.getPinnedPostsWithActor(actor.id);
    return c.json({
      posts: await enrichPostsBatch(db, posts, currentActor?.id),
    });
  });

  // GET /users/:username/boosts - Get posts boosted by a user
  api.get("/users/:username/boosts", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = await db.getBoostedPostsWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: await enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    });
  });

  // ============ Following ============

  api.get("/users/:username/followers", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const followers = await db.getFollowers(actor.id);
    return c.json({ followers: followers.map(sanitizeActor) });
  });

  api.get("/users/:username/following", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const actor = await db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const following = await db.getFollowing(actor.id);
    return c.json({ following: following.map(sanitizeActor) });
  });

  // POST /follow - Follow a user via ActivityPub Follow activity
  api.post("/follow", async (c) => {
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

    // Check if this is a local user first
    const isLocalTarget = !handleDomain || handleDomain === domain || handleDomain === domain.replace(/:\d+$/, "");

    let targetActor;
    if (isLocalTarget) {
      // Local user: look up directly in database
      targetActor = await db.getActorByUsername(username);
      if (!targetActor) {
        return c.json({ error: "User not found" }, 404);
      }

      // Can't follow yourself
      if (targetActor.id === actor.id) {
        return c.json({ error: "Cannot follow yourself" }, 400);
      }
    } else {
      // Remote user: use ActivityPub lookup
      const targetAP = await ctx.lookupObject(handle);
      if (!targetAP || !isActor(targetAP)) {
        return c.json({ error: "Actor not found" }, 404);
      }

      // Persist the target actor
      targetActor = await persistActor(db, domain, targetAP);
      if (!targetActor) {
        return c.json({ error: "Failed to persist actor" }, 500);
      }
    }

    // Create the Follow activity
    const followActivity = new Follow({
      id: new URL(`https://${domain}/#follows/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(targetActor.uri),
      to: new URL(targetActor.uri),
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, followActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to follow" }, 500);
    }

    return c.json({ ok: true, message: isLocalTarget ? "Now following" : "Follow request sent" });
  });

  // POST /unfollow - Unfollow a user via ActivityPub Undo(Follow) activity
  api.post("/unfollow", async (c) => {
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

    // Create the Follow activity to undo
    const followActivity = new Follow({
      id: new URL(`https://${domain}/#follows/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new URL(targetActor.uri),
    });

    // Create the Undo activity
    const undoActivity = new Undo({
      id: new URL(`https://${domain}/#undos/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: followActivity,
      to: new URL(targetActor.uri),
    });

    // Process through unified pipeline
    const result = await processActivity(ctx, db, domain, undoActivity, "outbound", user.username);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to unfollow" }, 500);
    }

    return c.json({ ok: true });
  });

  // ============ Profile ============

  // Update profile (name, bio)
  api.put("/profile", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json();
    const { name, bio } = body;

    // Validate lengths
    if (name && name.length > 100) {
      return c.json({ error: "Name too long (max 100 characters)" }, 400);
    }
    if (bio && bio.length > 500) {
      return c.json({ error: "Bio too long (max 500 characters)" }, 400);
    }

    const updated = await db.updateActorProfile(actor.id, { name, bio });
    if (!updated) {
      return c.json({ error: "Failed to update profile" }, 500);
    }

    return c.json({ actor: sanitizeActor(updated) });
  });

  // Upload avatar (expects base64 WebP image)
  api.post("/profile/avatar", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json();
    const { image } = body; // base64 encoded WebP

    if (!image) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Validate image size (max 2MB)
    if (imageData.length > 2 * 1024 * 1024) {
      return c.json({ error: "Image too large (max 2MB)" }, 400);
    }

    // Generate filename
    const filename = `${actor.id}-${Date.now()}.webp`;

    // Save to storage
    const avatarUrl = await saveAvatar(filename, imageData);

    // Update actor in database
    const updated = await db.updateActorProfile(actor.id, { avatar_url: avatarUrl });
    if (!updated) {
      return c.json({ error: "Failed to update avatar" }, 500);
    }

    return c.json({ actor: sanitizeActor(updated), avatar_url: avatarUrl });
  });

  // ============ Media ============

  // Upload media (expects base64 WebP image, already resized on client)
  api.post("/media", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json();
    const { image } = body; // base64 encoded WebP (data URL)

    if (!image) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageData = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));

    // Validate image size (max 5MB for media attachments)
    if (imageData.length > 5 * 1024 * 1024) {
      return c.json({ error: "Image too large (max 5MB)" }, 400);
    }

    // Generate unique filename
    const filename = `${crypto.randomUUID()}.webp`;

    // Save to storage
    const mediaUrl = await saveMedia(filename, imageData);

    return c.json({ url: mediaUrl, media_type: "image/webp" });
  });

  // ============ Search ============

  api.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    const type = c.req.query("type") || "all"; // "all", "users", "posts"
    const db = c.get("db");
    const domain = c.get("domain");
    const currentUser = c.get("user");
    const currentActor = currentUser ? await db.getActorByUserId(currentUser.id) : null;

    // If it looks like a handle, try to look it up
    if (query.match(/^@?[\w.-]+@[\w.-]+$/)) {
      const ctx = federation.createContext(c.req.raw, undefined);
      try {
        const actor = await ctx.lookupObject(query);
        if (actor && isActor(actor)) {
          const persisted = await persistActor(db, domain, actor);
          if (persisted) {
            return c.json({ users: [sanitizeActor(persisted)], posts: [] });
          }
        }
      } catch (err) {
        console.error("Lookup failed:", err);
      }
    }

    // Search users
    const users = (type === "all" || type === "users")
      ? (await db.searchActors(query)).map(sanitizeActor)
      : [];

    // Search posts (fuzzy search with pg_trgm)
    let posts: unknown[] = [];
    let postsLowConfidence = false;
    if ((type === "all" || type === "posts") && query.length >= 3) {
      const { posts: postResults, lowConfidence } = await db.searchPosts(query, 20);
      posts = await Promise.all(postResults.map(post => enrichPost(db, post, currentActor?.id)));
      postsLowConfidence = lowConfidence;
    }

    return c.json({ users, posts, postsLowConfidence });
  });

  // ============ Hashtags ============

  // Simple in-memory cache for tags
  let trendingCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
  let popularCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
  const TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  api.get("/tags/search", async (c) => {
    const query = c.req.query("q") || "";
    const db = c.get("db");

    if (!query.trim()) {
      return c.json({ tags: [] });
    }

    const tags = await db.searchTags(query, 10);
    return c.json({ tags });
  });

  // Popular tags (all-time) - for sidebar
  api.get("/tags/popular", async (c) => {
    const db = c.get("db");
    const now = Date.now();

    if (popularCache && (now - popularCache.cachedAt) < TAGS_CACHE_TTL) {
      return c.json({ tags: popularCache.tags });
    }

    const tags = await db.getPopularTags(10);
    popularCache = { tags, cachedAt: now };
    return c.json({ tags });
  });

  // Trending tags (recent activity) - for explore page
  api.get("/tags/trending", async (c) => {
    const db = c.get("db");
    const now = Date.now();

    if (trendingCache && (now - trendingCache.cachedAt) < TAGS_CACHE_TTL) {
      return c.json({ tags: trendingCache.tags });
    }

    const tags = await db.getTrendingTags(10, 48);
    trendingCache = { tags, cachedAt: now };
    return c.json({ tags });
  });

  api.get("/tags/:tag", async (c) => {
    const tag = c.req.param("tag");
    const db = c.get("db");
    const actor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    // Try cache for logged-out users
    if (!actor) {
      const cached = await getCachedHashtagPosts(tag, limit, before);
      if (cached) {
        return c.json(cached);
      }
    }

    const posts = await db.getPostsByHashtagWithActor(tag, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      tag,
      posts: await enrichPostsBatch(db, resultPosts, actor?.id),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users
    if (!actor) {
      await setCachedHashtagPosts(tag, limit, before, result);
    }

    return c.json(result);
  });

  // ============ Notifications ============

  // GET /notifications - Get user's notifications
  api.get("/notifications", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    const notifications = await getNotifications(db, actor.id, limit, offset);

    return c.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        created_at: formatDate(n.created_at),
        actor: {
          id: n.actor.public_id,
          handle: n.actor.handle,
          name: n.actor.name,
          avatar_url: n.actor.avatar_url,
        },
        post: n.post ? {
          id: n.post.public_id,
          content: n.post.content.slice(0, 100), // Preview only
        } : null,
      })),
    });
  });

  // GET /notifications/unread/count - Get unread notification count
  api.get("/notifications/unread/count", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const count = await getUnreadCount(db, actor.id);

    return c.json({ count });
  });

  // POST /notifications/read - Mark notifications as read
  api.post("/notifications/read", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const body = await c.req.json<{ ids?: number[] }>();

    await markAsRead(db, actor.id, body.ids);

    return c.json({ ok: true });
  });

  // DELETE /notifications - Delete notifications
  api.delete("/notifications", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const ids = c.req.query("ids")?.split(",").map(Number).filter(n => !isNaN(n));

    await deleteNotifications(db, actor.id, ids?.length ? ids : undefined);

    return c.json({ ok: true });
  });

  // ============ Communities ============
  const communityRoutes = createCommunityRoutes(db, federation);
  api.route("/communities", communityRoutes);

  return api;
}

// ============ Helpers ============

function sanitizeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    created_at: formatDate(user.created_at),
  };
}

export function sanitizeActor(actor: Actor) {
  return {
    id: actor.public_id,
    uri: actor.uri,
    handle: actor.handle,
    name: actor.name,
    bio: actor.bio,
    avatar_url: actor.avatar_url,
    url: actor.url,
    is_local: actor.user_id !== null,
    actor_type: actor.actor_type || 'Person',
    created_at: formatDate(actor.created_at),
  };
}

// Single post enrichment (for individual post views - includes boost count)
async function enrichPost(db: DB, post: Post, currentActorId?: number | null) {
  const actor = await db.getActorById(post.actor_id);
  const hashtags = await db.getPostHashtags(post.id);
  const boostsCount = await db.getBoostsCount(post.id);
  const liked = currentActorId ? await db.hasLiked(currentActorId, post.id) : false;
  const boosted = currentActorId ? await db.hasBoosted(currentActorId, post.id) : false;
  const pinned = currentActorId ? await db.isPinned(currentActorId, post.id) : false;
  const repliesCount = await db.getRepliesCount(post.id);
  const attachments = await db.getMediaByPostId(post.id);

  // Get parent post info if this is a reply
  let inReplyTo = null;
  if (post.in_reply_to_id) {
    const parentPost = await db.getPostById(post.in_reply_to_id);
    if (parentPost) {
      const parentActor = await db.getActorById(parentPost.actor_id);
      inReplyTo = {
        id: parentPost.public_id,
        uri: parentPost.uri,
        content: parentPost.content,
        url: parentPost.url,
        created_at: formatDate(parentPost.created_at),
        author: parentActor ? sanitizeActor(parentActor) : null,
      };
    }
  }

  return {
    id: post.public_id,
    uri: post.uri,
    content: post.content,
    url: post.url,
    created_at: formatDate(post.created_at),
    author: actor ? sanitizeActor(actor) : null,
    hashtags: hashtags.map((h) => h.name),
    likes_count: post.likes_count, // Use denormalized count
    boosts_count: boostsCount,
    liked,
    boosted,
    pinned,
    replies_count: repliesCount,
    in_reply_to: inReplyTo,
    sensitive: post.sensitive,
    attachments: attachments.map(a => ({
      id: a.id,  // Media IDs stay internal for now
      url: a.url,
      media_type: a.media_type,
      alt_text: a.alt_text,
      width: a.width,
      height: a.height,
    })),
  };
}

// Batch enrichment for feeds (optimized - no boost count)
export async function enrichPostsBatch(db: DB, posts: PostWithActor[], currentActorId?: number | null) {
  if (posts.length === 0) return [];

  const postIds = posts.map(p => p.id);

  // Batch fetch all related data
  const hashtagsMap = await db.getHashtagsForPosts(postIds);
  const repliesCountMap = await db.getRepliesCounts(postIds);
  const likedSet = currentActorId ? await db.getLikedPostIds(currentActorId, postIds) : new Set<number>();
  const boostedSet = currentActorId ? await db.getBoostedPostIds(currentActorId, postIds) : new Set<number>();
  const pinnedSet = currentActorId ? await db.getPinnedPostIds(currentActorId, postIds) : new Set<number>();
  const mediaMap = await db.getMediaForPosts(postIds);

  // Batch fetch parent posts for replies
  const parentIds = [...new Set(posts.filter(p => p.in_reply_to_id).map(p => p.in_reply_to_id!))];
  const parentPosts = await db.getPostsByIds(parentIds);
  const parentActorIds = [...new Set([...parentPosts.values()].map(p => p.actor_id))];
  const parentActors = await db.getActorsByIds(parentActorIds);

  return posts.map(post => {
    let inReplyTo = null;
    if (post.in_reply_to_id) {
      const parentPost = parentPosts.get(post.in_reply_to_id);
      if (parentPost) {
        const parentActor = parentActors.get(parentPost.actor_id);
        inReplyTo = {
          id: parentPost.public_id,
          uri: parentPost.uri,
          content: parentPost.content,
          url: parentPost.url,
          created_at: formatDate(parentPost.created_at),
          author: parentActor ? sanitizeActor(parentActor) : null,
        };
      }
    }

    const attachments = mediaMap.get(post.id) || [];

    return {
      id: post.public_id,
      uri: post.uri,
      content: post.content,
      url: post.url,
      created_at: formatDate(post.created_at),
      author: sanitizeActor(post.author),
      hashtags: hashtagsMap.get(post.id) || [],
      likes_count: post.likes_count,
      boosts_count: 0, // Skip boost count in feeds for performance
      liked: likedSet.has(post.id),
      boosted: boostedSet.has(post.id),
      pinned: pinnedSet.has(post.id),
      replies_count: repliesCountMap.get(post.id) || 0,
      in_reply_to: inReplyTo,
      sensitive: post.sensitive,
      attachments: attachments.map(a => ({
        id: a.id,
        url: a.url,
        media_type: a.media_type,
        alt_text: a.alt_text,
        width: a.width,
        height: a.height,
      })),
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltStr = btoa(String.fromCharCode(...salt));
  return `${saltStr}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltStr, storedHash] = stored.split(":");
  const salt = Uint8Array.from(atob(saltStr), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hash === storedHash;
}
