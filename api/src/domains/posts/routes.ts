/**
 * Posts Routes
 *
 * HTTP endpoints for posts.
 */

import { Hono } from "@hono/hono";
import {
  Create,
  Delete,
  Document,
  Note,
  Tombstone,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Federation } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import type { CommunityDB } from "../communities/repository.ts";
import * as service from "./service.ts";
import { getCachedHashtagPosts, setCachedHashtagPosts, invalidateProfileCache } from "../../cache.ts";
import { saveMedia, deleteMedia } from "../../storage.ts";
import { processActivity } from "../../activities.ts";

interface PostsEnv {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createPostRoutes(federation: Federation<void>): Hono<PostsEnv> {
  const routes = new Hono<PostsEnv>();

  // GET /posts - Get recent posts (public feed)
  routes.get("/posts", async (c) => {
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const result = await service.getRecentPosts(db, limit, before, currentActor?.id, domain);
    return c.json(result);
  });

  // GET /posts/hot - Get hot posts
  routes.get("/posts/hot", async (c) => {
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    const posts = await service.getHotPosts(db, limit, currentActor?.id, domain);
    return c.json({ posts });
  });

  // GET /timeline - Get authenticated user's timeline
  routes.get("/timeline", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";

    const result = await service.getTimelinePosts(db, actor.id, limit, before, sort, domain);
    return c.json(result);
  });

  // GET /posts/:id - Get a single post with ancestor chain
  routes.get("/posts/:id", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Get ancestor chain (walk up in_reply_to_id)
    const ancestors: Awaited<ReturnType<typeof service.enrichPost>>[] = [];
    let currentPost = post;
    const seen = new Set<number>([post.id]); // Prevent infinite loops

    while (currentPost.in_reply_to_id) {
      const parentPost = await db.getPostById(currentPost.in_reply_to_id);
      if (!parentPost || seen.has(parentPost.id)) break;
      seen.add(parentPost.id);
      ancestors.unshift(await service.enrichPost(db, parentPost, currentActor?.id, domain));
      currentPost = parentPost;
    }

    // Enrich the main post
    const enrichedPost = await service.enrichPost(db, post, currentActor?.id, domain);

    return c.json({ post: enrichedPost, ancestors });
  });

  // GET /posts/:id/replies - Get replies to a post
  routes.get("/posts/:id/replies", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const after = c.req.query("after") ? parseInt(c.req.query("after")!) : undefined;
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";

    // Get the parent post's author to identify OP replies
    const parentAuthor = await db.getActorById(post.actor_id);

    // Use optimized batch method with pagination - pass OP actor ID to sort OP replies first
    const replies = await db.getRepliesWithActor(post.id, limit + 1, after, sort, post.actor_id);

    const hasMore = replies.length > limit;
    const resultReplies = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore && resultReplies.length > 0
      ? resultReplies[resultReplies.length - 1].id
      : null;

    return c.json({
      replies: await service.enrichPostsBatch(db, resultReplies, currentActor?.id, domain),
      next_cursor: nextCursor,
      op_author_id: parentAuthor?.public_id || null,
    });
  });

  // GET /search - Search posts
  routes.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    if (!query.trim()) {
      return c.json({ posts: [] });
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    const posts = await service.searchPosts(db, query, limit, currentActor?.id, domain);
    return c.json({ posts });
  });

  // GET /hashtag/:tag - Get posts by hashtag
  routes.get("/hashtag/:tag", async (c) => {
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    // Check cache for unauthenticated users
    if (!currentActor && !before) {
      const cached = await getCachedHashtagPosts(tag, limit);
      if (cached) {
        return c.json(cached);
      }
    }

    const result = await service.getPostsByHashtag(db, tag, limit, before, currentActor?.id, domain);

    // Cache for unauthenticated users
    if (!currentActor && !before) {
      await setCachedHashtagPosts(tag, limit, before, result);
    }

    return c.json(result);
  });

  // POST /posts/:id/pin - Pin a post
  routes.post("/posts/:id/pin", async (c) => {
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

    if (post.actor_id !== actor.id) {
      return c.json({ error: "Cannot pin another user's post" }, 403);
    }

    const result = await service.pinPost(db, actor.id, post.id);
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ ok: true, pinned: true });
  });

  // DELETE /posts/:id/pin - Unpin a post
  routes.delete("/posts/:id/pin", async (c) => {
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

    if (post.actor_id !== actor.id) {
      return c.json({ error: "Cannot unpin another user's post" }, 403);
    }

    await service.unpinPost(db, actor.id, post.id);
    return c.json({ ok: true, pinned: false });
  });

  // POST /posts/:id/report - Report a post
  routes.post("/posts/:id/report", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { reason, details } = await c.req.json<{ reason: string; details?: string }>();

    // Validate reason BEFORE looking up post (matches original api.ts order)
    const validReasons = ['spam', 'harassment', 'hate_speech', 'violence', 'misinformation', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return c.json({ error: "Invalid reason" }, 400);
    }

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Can't report your own post
    if (post.actor_id === actor.id) {
      return c.json({ error: "Cannot report your own post" }, 400);
    }

    try {
      // Note: db.createReport expects (postId, reporterId, reason, details)
      await db.createReport(post.id, actor.id, reason, details || null);
      return c.json({ ok: true });
    } catch (err) {
      // Handle unique constraint violation (already reported)
      if (err instanceof Error && err.message.includes('unique')) {
        return c.json({ error: "You have already reported this post" }, 400);
      }
      throw err;
    }
  });

  // POST /media - Upload media (expects base64 WebP image)
  routes.post("/media", async (c) => {
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

  // POST /posts - Create post via ActivityPub Create activity
  routes.post("/posts", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const domain = c.get("domain");
    const db = c.get("db");
    const communityDb = c.get("communityDb");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    interface AttachmentInput {
      url: string;
      alt_text?: string;
      width: number;
      height: number;
    }

    const { content, in_reply_to, attachments, sensitive, link_url, video_url } = await c.req.json<{
      content: string;
      in_reply_to?: string;  // UUID/public_id
      attachments?: AttachmentInput[];
      sensitive?: boolean;
      link_url?: string;
      video_url?: string;
    }>();

    // Validate input
    const validation = await service.validateCreatePost(
      db,
      { content, inReplyTo: in_reply_to, attachments, sensitive, linkUrl: link_url, videoUrl: video_url },
      communityDb ? { getCommunityForPost: communityDb.getCommunityForPost.bind(communityDb), isBanned: communityDb.isBanned.bind(communityDb) } : undefined,
      actor.id
    );

    if (!validation.valid) {
      // Return 404 for "Parent post not found", 403 for community bans, 400 for other validation errors
      const status = validation.error === "Parent post not found" ? 404 :
                     validation.error === "You are banned from this community" ? 403 : 400;
      return c.json({ error: validation.error }, status);
    }

    const { replyToPost, linkPreview, videoEmbed } = validation;

    // Process content: escape HTML, linkify mentions and hashtags
    const { html: processedContent, mentions } = service.processContent(content, domain);
    // If there's a link or video, append it to content for federation (so other servers can generate their own cards)
    let safeContent = `<p>${processedContent}</p>`;
    if (link_url) {
      safeContent += `<p><a href="${service.escapeHtml(link_url)}">${service.escapeHtml(link_url)}</a></p>`;
    }
    if (video_url) {
      safeContent += `<p><a href="${service.escapeHtml(video_url)}">${service.escapeHtml(video_url)}</a></p>`;
    }

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

    // Store link preview if we have one
    if (linkPreview) {
      await db.updatePostLinkPreview(post.id, linkPreview);
      post.link_preview = linkPreview;
    }

    // Store video embed if we have one
    if (videoEmbed) {
      await db.updatePostVideoEmbed(post.id, videoEmbed);
      post.video_embed = videoEmbed;
    }

    // Note: Media records are created by processCreate from the Note attachments
    // No need to create them here again

    // Invalidate the author's profile cache
    await invalidateProfileCache(actor.id);

    // Create notifications for mentioned users
    await service.notifyMentions(db, mentions, actor.id, post.id, domain);

    return c.json({ post: await service.enrichPost(db, post, actor?.id, domain) });
  });

  // DELETE /posts/:id - Delete post via ActivityPub Delete activity
  routes.delete("/posts/:id", async (c) => {
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

  return routes;
}

// Re-export service functions for use by other modules
export { enrichPost, enrichPostsBatch } from "./service.ts";
