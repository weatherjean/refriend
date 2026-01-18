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

type Env = {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
};

export function createApi(db: DB, federation: Federation<void>) {
  const api = new Hono<Env>();

  // CORS for frontend
  api.use("/*", cors({
    origin: (origin) => {
      // Allow any localhost port for development
      if (origin?.startsWith("http://localhost:")) return origin;
      // Allow tunnel domains
      if (origin?.includes(".localhost.run")) return origin;
      if (origin?.includes(".serveo.net")) return origin;
      return origin; // Allow all for now during development
    },
    credentials: true,
  }));

  // Inject db and check session (domain comes from main.ts middleware)
  api.use("/*", async (c, next) => {
    c.set("db", db);
    // Domain is set by the middleware in main.ts, use it or fall back
    const domain = c.get("domain") || new URL(c.req.url).host;
    c.set("domain", domain);

    const token = getCookie(c, "session");
    if (token) {
      const session = db.getSession(token);
      if (session) {
        const user = db.getUserById(session.user_id);
        const actor = user ? db.getActorByUserId(user.id) : null;
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

    if (db.getUserByUsername(username)) {
      return c.json({ error: "Username taken" }, 400);
    }

    const passwordHash = await hashPassword(password);
    const user = db.createUser(username, passwordHash);

    // Create actor for the user
    const actorUri = `https://${domain}/users/${username}`;
    const actor = db.createActor({
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

    const token = db.createSession(user.id);
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

    const user = db.getUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const actor = db.getActorByUserId(user.id);
    const token = db.createSession(user.id);
    setCookie(c, "session", token, {
      httpOnly: true,
      secure: domain !== "localhost:8000",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return c.json({ user: sanitizeUser(user), actor: actor ? sanitizeActor(actor) : null });
  });

  api.post("/auth/logout", (c) => {
    const token = getCookie(c, "session");
    if (token) {
      c.get("db").deleteSession(token);
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
    const fullUser = db.getUserById(user.id);
    if (!fullUser || !(await verifyPassword(current_password, fullUser.password_hash))) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    // Update password
    const newHash = await hashPassword(new_password);
    db.updateUserPassword(user.id, newHash);

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
    const users = db.getTrendingUsers(3);
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

  api.get("/users/:username", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if current user is following this profile
    const isFollowing = currentActor ? db.isFollowing(currentActor.id, actor.id) : false;
    const isOwnProfile = currentActor?.id === actor.id;

    return c.json({
      actor: sanitizeActor(actor),
      stats: {
        followers: db.getFollowersCount(actor.id),
        following: db.getFollowingCount(actor.id),
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
    const actor = db.getActorByUsername(username);

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
      ? db.getRepliesByActorWithActor(actor.id, limit + 1, before)
      : db.getPostsByActorWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      posts: enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users viewing main posts
    if (!filter && !currentActor) {
      await setCachedProfilePosts(actor.id, limit, before, result);
    }

    return c.json(result);
  });

  // Get actor by ID (works for both local and remote)
  api.get("/actors/:id", (c) => {
    const id = parseInt(c.req.param("id"));
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorById(id);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    const isFollowing = currentActor ? db.isFollowing(currentActor.id, actor.id) : false;
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
    const id = parseInt(c.req.param("id"));
    const filter = c.req.query("filter");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = db.getActorById(id);

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
      ? db.getRepliesByActorWithActor(actor.id, limit + 1, before)
      : db.getPostsByActorWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      posts: enrichPostsBatch(db, resultPosts, currentActor?.id),
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
    const id = parseInt(c.req.param("id"));
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const actor = db.getActorById(id);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    // For local actors, return from our pinned_posts table
    if (actor.user_id !== null) {
      const posts = db.getPinnedPostsWithActor(actor.id);
      return c.json({
        posts: enrichPostsBatch(db, posts, currentActor?.id),
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
      const posts: ReturnType<typeof enrichPost>[] = [];

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
        let post = db.getPostByUri(noteUri);
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

          // Get original published timestamp
          let createdAt: string | undefined;
          if (note.published) {
            // Convert Temporal.Instant to SQLite datetime format
            const isoDate = note.published.toString();
            createdAt = isoDate.replace("T", " ").replace("Z", "").split(".")[0];
          }

          // Get sensitive flag
          const sensitive = note.sensitive ?? false;

          // Create the post
          post = db.createPost({
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

                  db.createMedia(post.id, attUrlString, mediaType, altText, width, height);
                }
              }
            }
          } catch {
            // Attachments may not be present
          }

          console.log(`[Featured] Stored pinned post: ${post.id}`);
        }

        posts.push(enrichPost(db, post, currentActor?.id));
      }

      console.log(`[Featured] Found ${posts.length} pinned posts for ${actor.handle}`);
      return c.json({ posts });
    } catch (err) {
      console.error(`[Featured] Error fetching featured collection:`, err);
      return c.json({ posts: [] });
    }
  });

  // ============ Posts ============

  api.get("/posts", (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const timeline = c.req.query("timeline") || "public";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    // Use optimized batch methods with actor JOIN and pagination
    const posts = timeline === "home" && actor
      ? db.getHomeFeedWithActor(actor.id, limit + 1, before)
      : db.getPublicTimelineWithActor(limit + 1, before);

    // Check if there are more posts
    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: enrichPostsBatch(db, resultPosts, actor?.id),
      next_cursor: nextCursor,
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
      in_reply_to?: number;
      attachments?: AttachmentInput[];
      sensitive?: boolean;
    }>();

    if (!content?.trim()) {
      return c.json({ error: "Content required" }, 400);
    }

    // Validate attachments (max 4)
    if (attachments && attachments.length > 4) {
      return c.json({ error: "Maximum 4 attachments allowed" }, 400);
    }

    // Check if replying to a valid post
    let replyToPost = null;
    if (in_reply_to) {
      replyToPost = db.getPostById(in_reply_to);
      if (!replyToPost) {
        return c.json({ error: "Parent post not found" }, 404);
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
    const post = db.getPostByUri(noteUri);
    if (!post) {
      return c.json({ error: "Post not found after creation" }, 500);
    }

    // Note: Media records are created by processCreate from the Note attachments
    // No need to create them here again

    // Invalidate the author's profile cache
    await invalidateProfileCache(actor.id);

    return c.json({ post: enrichPost(db, post, actor?.id) });
  });

  api.get("/posts/:id", (c) => {
    const id = parseInt(c.req.param("id"));
    const db = c.get("db");
    const actor = c.get("actor");
    const post = db.getPostById(id);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Get ancestor chain (walk up in_reply_to_id)
    const ancestors: ReturnType<typeof enrichPost>[] = [];
    let currentPost = post;
    const seen = new Set<number>([post.id]); // Prevent infinite loops

    while (currentPost.in_reply_to_id) {
      const parentPost = db.getPostById(currentPost.in_reply_to_id);
      if (!parentPost || seen.has(parentPost.id)) break;
      seen.add(parentPost.id);
      ancestors.unshift(enrichPost(db, parentPost, actor?.id));
      currentPost = parentPost;
    }

    return c.json({ post: enrichPost(db, post, actor?.id), ancestors });
  });

  api.get("/posts/:id/replies", (c) => {
    const id = parseInt(c.req.param("id"));
    const db = c.get("db");
    const actor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const after = c.req.query("after") ? parseInt(c.req.query("after")!) : undefined;
    const post = db.getPostById(id);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Use optimized batch method with pagination (replies use "after" since they're ASC)
    const replies = db.getRepliesWithActor(post.id, limit + 1, after);

    const hasMore = replies.length > limit;
    const resultReplies = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore && resultReplies.length > 0
      ? resultReplies[resultReplies.length - 1].id
      : null;

    return c.json({
      replies: enrichPostsBatch(db, resultReplies, actor?.id),
      next_cursor: nextCursor,
    });
  });

  // DELETE /posts/:id - Delete post via ActivityPub Delete activity
  api.delete("/posts/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
    if (!post || post.actor_id !== actor.id) {
      return c.json({ error: "Not found or unauthorized" }, 404);
    }

    // Get media files before deleting (CASCADE will delete DB records)
    const mediaFiles = db.getMediaByPostId(id);

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
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
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
      likes_count: db.getLikesCount(post.id),
      liked: true,
    });
  });

  // DELETE /posts/:id/like - Unlike a post via ActivityPub Undo(Like) activity
  api.delete("/posts/:id/like", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
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
      likes_count: db.getLikesCount(post.id),
      liked: false,
    });
  });

  // POST /posts/:id/boost - Boost a post via ActivityPub Announce activity
  api.post("/posts/:id/boost", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
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
      boosts_count: db.getBoostsCount(post.id),
      boosted: true,
    });
  });

  // DELETE /posts/:id/boost - Unboost a post via ActivityPub Undo(Announce) activity
  api.delete("/posts/:id/boost", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");
    const domain = c.get("domain");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
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
      boosts_count: db.getBoostsCount(post.id),
      boosted: false,
    });
  });

  // POST /posts/:id/pin - Pin a post to profile
  api.post("/posts/:id/pin", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Can only pin your own posts
    if (post.actor_id !== actor.id) {
      return c.json({ error: "Cannot pin another user's post" }, 403);
    }

    // Limit to 5 pinned posts
    const pinnedCount = db.getPinnedPostsCount(actor.id);
    if (pinnedCount >= 5 && !db.isPinned(actor.id, post.id)) {
      return c.json({ error: "Cannot pin more than 5 posts" }, 400);
    }

    db.pinPost(actor.id, post.id);
    return c.json({ ok: true, pinned: true });
  });

  // DELETE /posts/:id/pin - Unpin a post from profile
  api.delete("/posts/:id/pin", async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const post = db.getPostById(id);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    db.unpinPost(actor.id, post.id);
    return c.json({ ok: true, pinned: false });
  });

  // GET /users/:username/pinned - Get pinned posts for a user
  api.get("/users/:username/pinned", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = db.getPinnedPostsWithActor(actor.id);
    return c.json({
      posts: enrichPostsBatch(db, posts, currentActor?.id),
    });
  });

  // GET /users/:username/boosts - Get posts boosted by a user
  api.get("/users/:username/boosts", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = db.getBoostedPostsWithActor(actor.id, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: enrichPostsBatch(db, resultPosts, currentActor?.id),
      next_cursor: nextCursor,
    });
  });

  // ============ Following ============

  api.get("/users/:username/followers", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const followers = db.getFollowers(actor.id);
    return c.json({ followers: followers.map(sanitizeActor) });
  });

  api.get("/users/:username/following", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const following = db.getFollowing(actor.id);
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
      targetActor = db.getActorByUsername(username);
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

    const { actor_id } = await c.req.json<{ actor_id: number }>();
    const targetActor = db.getActorById(actor_id);

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

    const updated = db.updateActorProfile(actor.id, { name, bio });
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

    // Generate filename
    const filename = `${actor.id}-${Date.now()}.webp`;

    // Save to storage
    const avatarUrl = await saveAvatar(filename, imageData);

    // Update actor in database
    const updated = db.updateActorProfile(actor.id, { avatar_url: avatarUrl });
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

    // Generate unique filename
    const filename = `${crypto.randomUUID()}.webp`;

    // Save to storage
    const mediaUrl = await saveMedia(filename, imageData);

    return c.json({ url: mediaUrl, media_type: "image/webp" });
  });

  // ============ Search ============

  api.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    const db = c.get("db");
    const domain = c.get("domain");

    // If it looks like a handle, try to look it up
    if (query.match(/^@?[\w.-]+@[\w.-]+$/)) {
      const ctx = federation.createContext(c.req.raw, undefined);
      try {
        const actor = await ctx.lookupObject(query);
        if (actor && isActor(actor)) {
          const persisted = await persistActor(db, domain, actor);
          if (persisted) {
            return c.json({ results: [sanitizeActor(persisted)] });
          }
        }
      } catch (err) {
        console.error("Lookup failed:", err);
      }
    }

    // Local search by username
    const localResults = db.searchActors(query);
    return c.json({ results: localResults.map(sanitizeActor) });
  });

  // ============ Hashtags ============

  // Simple in-memory cache for tags
  let trendingCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
  let popularCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
  const TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  api.get("/tags/search", (c) => {
    const query = c.req.query("q") || "";
    const db = c.get("db");

    if (!query.trim()) {
      return c.json({ tags: [] });
    }

    const tags = db.searchTags(query, 10);
    return c.json({ tags });
  });

  // Popular tags (all-time) - for sidebar
  api.get("/tags/popular", (c) => {
    const db = c.get("db");
    const now = Date.now();

    if (popularCache && (now - popularCache.cachedAt) < TAGS_CACHE_TTL) {
      return c.json({ tags: popularCache.tags });
    }

    const tags = db.getPopularTags(10);
    popularCache = { tags, cachedAt: now };
    return c.json({ tags });
  });

  // Trending tags (recent activity) - for explore page
  api.get("/tags/trending", (c) => {
    const db = c.get("db");
    const now = Date.now();

    if (trendingCache && (now - trendingCache.cachedAt) < TAGS_CACHE_TTL) {
      return c.json({ tags: trendingCache.tags });
    }

    const tags = db.getTrendingTags(10, 48);
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

    const posts = db.getPostsByHashtagWithActor(tag, limit + 1, before);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    const result = {
      tag,
      posts: enrichPostsBatch(db, resultPosts, actor?.id),
      next_cursor: nextCursor,
    };

    // Cache for logged-out users
    if (!actor) {
      await setCachedHashtagPosts(tag, limit, before, result);
    }

    return c.json(result);
  });

  return api;
}

// ============ Helpers ============

function sanitizeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
  };
}

function sanitizeActor(actor: Actor) {
  return {
    id: actor.id,
    uri: actor.uri,
    handle: actor.handle,
    name: actor.name,
    bio: actor.bio,
    avatar_url: actor.avatar_url,
    url: actor.url,
    is_local: actor.user_id !== null,
    created_at: actor.created_at,
  };
}

// Single post enrichment (for individual post views - includes boost count)
function enrichPost(db: DB, post: Post, currentActorId?: number | null) {
  const actor = db.getActorById(post.actor_id);
  const hashtags = db.getPostHashtags(post.id);
  const boostsCount = db.getBoostsCount(post.id);
  const liked = currentActorId ? db.hasLiked(currentActorId, post.id) : false;
  const boosted = currentActorId ? db.hasBoosted(currentActorId, post.id) : false;
  const pinned = currentActorId ? db.isPinned(currentActorId, post.id) : false;
  const repliesCount = db.getRepliesCount(post.id);
  const attachments = db.getMediaByPostId(post.id);

  // Get parent post info if this is a reply
  let inReplyTo = null;
  if (post.in_reply_to_id) {
    const parentPost = db.getPostById(post.in_reply_to_id);
    if (parentPost) {
      const parentActor = db.getActorById(parentPost.actor_id);
      inReplyTo = {
        id: parentPost.id,
        uri: parentPost.uri,
        content: parentPost.content,
        url: parentPost.url,
        created_at: parentPost.created_at,
        author: parentActor ? sanitizeActor(parentActor) : null,
      };
    }
  }

  return {
    id: post.id,
    uri: post.uri,
    content: post.content,
    url: post.url,
    created_at: post.created_at,
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
      id: a.id,
      url: a.url,
      media_type: a.media_type,
      alt_text: a.alt_text,
      width: a.width,
      height: a.height,
    })),
  };
}

// Batch enrichment for feeds (optimized - no boost count)
function enrichPostsBatch(db: DB, posts: PostWithActor[], currentActorId?: number | null) {
  if (posts.length === 0) return [];

  const postIds = posts.map(p => p.id);

  // Batch fetch all related data
  const hashtagsMap = db.getHashtagsForPosts(postIds);
  const repliesCountMap = db.getRepliesCounts(postIds);
  const likedSet = currentActorId ? db.getLikedPostIds(currentActorId, postIds) : new Set<number>();
  const boostedSet = currentActorId ? db.getBoostedPostIds(currentActorId, postIds) : new Set<number>();
  const pinnedSet = currentActorId ? db.getPinnedPostIds(currentActorId, postIds) : new Set<number>();
  const mediaMap = db.getMediaForPosts(postIds);

  // Batch fetch parent posts for replies
  const parentIds = posts.filter(p => p.in_reply_to_id).map(p => p.in_reply_to_id!);
  const parentPosts = new Map<number, Post>();
  const parentActors = new Map<number, Actor>();
  if (parentIds.length > 0) {
    for (const id of parentIds) {
      const post = db.getPostById(id);
      if (post) {
        parentPosts.set(id, post);
        const actor = db.getActorById(post.actor_id);
        if (actor) parentActors.set(post.actor_id, actor);
      }
    }
  }

  return posts.map(post => {
    let inReplyTo = null;
    if (post.in_reply_to_id) {
      const parentPost = parentPosts.get(post.in_reply_to_id);
      if (parentPost) {
        const parentActor = parentActors.get(parentPost.actor_id);
        inReplyTo = {
          id: parentPost.id,
          uri: parentPost.uri,
          content: parentPost.content,
          url: parentPost.url,
          created_at: parentPost.created_at,
          author: parentActor ? sanitizeActor(parentActor) : null,
        };
      }
    }

    const attachments = mediaMap.get(post.id) || [];

    return {
      id: post.id,
      uri: post.uri,
      content: post.content,
      url: post.url,
      created_at: post.created_at,
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
