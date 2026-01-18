import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getCookie, setCookie, deleteCookie } from "@hono/hono/cookie";
import {
  Announce,
  Collection,
  Create,
  Delete,
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
import type { DB, Actor, Post, User } from "./db.ts";
import { processActivity, persistActor } from "./activities.ts";

declare const Temporal: {
  Now: { instant(): { toString(): string } };
};

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

  // ============ Profile ============

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
  api.get("/users/:username/posts", (c) => {
    const username = c.req.param("username");
    const filter = c.req.query("filter");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = filter === "replies"
      ? db.getRepliesByActor(actor.id)
      : db.getPostsByActor(actor.id);
    return c.json({
      posts: posts.map((p) => enrichPost(db, p, currentActor?.id)),
    });
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
  api.get("/actors/:id/posts", (c) => {
    const id = parseInt(c.req.param("id"));
    const filter = c.req.query("filter");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorById(id);

    if (!actor) {
      return c.json({ error: "Actor not found" }, 404);
    }

    const posts = filter === "replies"
      ? db.getRepliesByActor(actor.id)
      : db.getPostsByActor(actor.id);
    return c.json({
      posts: posts.map((p) => enrichPost(db, p, currentActor?.id)),
    });
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
      const posts = db.getPinnedPosts(actor.id);
      return c.json({
        posts: posts.map((p) => enrichPost(db, p, currentActor?.id)),
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

          // Create the post
          post = db.createPost({
            uri: noteUri,
            actor_id: actor.id,
            content,
            url: urlString,
            in_reply_to_id: null,
            created_at: createdAt,
          });

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

    let posts: Post[];
    if (timeline === "home" && actor) {
      posts = db.getHomeFeed(actor.id);
    } else {
      posts = db.getPublicTimeline();
    }

    return c.json({
      posts: posts.map((p) => enrichPost(db, p, actor?.id)),
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

    const { content, in_reply_to } = await c.req.json<{ content: string; in_reply_to?: number }>();
    if (!content?.trim()) {
      return c.json({ error: "Content required" }, 400);
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

    return c.json({ post: enrichPost(db, post, actor?.id) });
  });

  api.get("/posts/:id/replies", (c) => {
    const id = parseInt(c.req.param("id"));
    const db = c.get("db");
    const actor = c.get("actor");
    const post = db.getPostById(id);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const replies = db.getReplies(post.id);
    return c.json({
      replies: replies.map((p) => enrichPost(db, p, actor?.id)),
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

    const posts = db.getPinnedPosts(actor.id);
    return c.json({
      posts: posts.map((p) => enrichPost(db, p, currentActor?.id)),
    });
  });

  // GET /users/:username/boosts - Get posts boosted by a user
  api.get("/users/:username/boosts", (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const currentActor = c.get("actor");
    const actor = db.getActorByUsername(username);

    if (!actor) {
      return c.json({ error: "User not found" }, 404);
    }

    const posts = db.getBoostedPosts(actor.id);
    return c.json({
      posts: posts.map((p) => enrichPost(db, p, currentActor?.id)),
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

  api.get("/tags/:tag", (c) => {
    const tag = c.req.param("tag");
    const db = c.get("db");
    const actor = c.get("actor");
    const posts = db.getPostsByHashtag(tag);

    return c.json({
      tag,
      posts: posts.map((p) => enrichPost(db, p, actor?.id)),
    });
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

function enrichPost(db: DB, post: Post, currentActorId?: number | null) {
  const actor = db.getActorById(post.actor_id);
  const hashtags = db.getPostHashtags(post.id);
  const likesCount = db.getLikesCount(post.id);
  const boostsCount = db.getBoostsCount(post.id);
  const liked = currentActorId ? db.hasLiked(currentActorId, post.id) : false;
  const boosted = currentActorId ? db.hasBoosted(currentActorId, post.id) : false;
  const pinned = currentActorId ? db.isPinned(currentActorId, post.id) : false;
  const repliesCount = db.getRepliesCount(post.id);

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
    likes_count: likesCount,
    boosts_count: boostsCount,
    liked,
    boosted,
    pinned,
    replies_count: repliesCount,
    in_reply_to: inReplyTo,
  };
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
