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
  Hashtag,
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
import { rateLimit } from "../../middleware/rate-limit.ts";
import { parseIntSafe } from "../../shared/utils.ts";

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

  // GET /posts/all - Get all posts for troubleshooting (auth required)
  routes.get("/posts/all", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    const posts = await db.getAllPostsWithActor(limit + 1, before);
    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && resultPosts.length > 0
      ? resultPosts[resultPosts.length - 1].id
      : null;

    return c.json({
      posts: await service.enrichPostsBatch(db, resultPosts, currentActor?.id, domain, communityDb),
      next_cursor: nextCursor,
    });
  });

  // GET /posts/hot - Get hot posts from user's timeline
  routes.get("/posts/hot", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);

    const result = await service.getTimelinePosts(db, actor.id, limit, undefined, "hot", domain, communityDb);
    return c.json({ posts: result.posts });
  });

  // GET /timeline - Get authenticated user's timeline
  routes.get("/timeline", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";

    const result = await service.getTimelinePosts(db, actor.id, limit, before, sort, domain, communityDb);
    return c.json(result);
  });

  // GET /posts/:id - Get a single post with ancestor chain
  routes.get("/posts/:id", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Get ancestor chain using batch fetch (single recursive CTE query)
    const ancestorPosts = await db.getAncestorChainWithActor(post.id, 50);
    const ancestors = await service.enrichPostsBatch(db, ancestorPosts, currentActor?.id, domain, communityDb);

    // Enrich the main post
    const enrichedPost = await service.enrichPost(db, post, currentActor?.id, domain, communityDb);

    return c.json({ post: enrichedPost, ancestors });
  });

  // GET /posts/:id/replies - Get replies to a post
  routes.get("/posts/:id/replies", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const after = parseIntSafe(c.req.query("after")) ?? undefined;
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
      replies: await service.enrichPostsBatch(db, resultReplies, currentActor?.id, domain, communityDb),
      next_cursor: nextCursor,
      op_author_id: parentAuthor?.public_id || null,
    });
  });

  // GET /hashtag/:tag - Get posts by hashtag
  routes.get("/hashtag/:tag", async (c) => {
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    // Check cache for unauthenticated users
    if (!currentActor && !before) {
      const cached = await getCachedHashtagPosts(tag, limit);
      if (cached) {
        return c.json(cached);
      }
    }

    const result = await service.getPostsByHashtag(db, tag, limit, before, currentActor?.id, domain, communityDb);

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

  // POST /posts/:id/report - Report a post (rate limited)
  routes.post("/posts/:id/report", rateLimit("report"), async (c) => {
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

  // POST /media - Upload media (expects base64 WebP image) - rate limited
  routes.post("/media", rateLimit("media:upload"), async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json();
    const { image } = body; // base64 encoded WebP (data URL)

    if (!image) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Extract format from data URL (e.g., "data:image/webp;base64,..." -> "webp")
    // Safari doesn't support WebP encoding and silently returns PNG/JPEG
    const formatMatch = image.match(/^data:image\/(\w+);base64,/);
    const format = formatMatch?.[1] || "webp";
    const extension = format === "jpeg" ? "jpg" : format;

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageData = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));

    // Validate image size (max 25MB for media attachments)
    if (imageData.length > 25 * 1024 * 1024) {
      return c.json({ error: "Image too large (max 25MB)" }, 400);
    }

    // Generate unique filename with correct extension
    const filename = `${crypto.randomUUID()}.${extension}`;

    // Save to storage
    const mediaUrl = await saveMedia(filename, imageData);

    return c.json({ url: mediaUrl, media_type: `image/${format}` });
  });

  // POST /posts - Create post via ActivityPub Create activity (rate limited)
  routes.post("/posts", rateLimit("post:create"), async (c) => {
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

    // Extract hashtags from plain text BEFORE HTML processing
    const hashtagMatches = content.match(/#[\w]+/g) || [];
    const hashtagNames = [...new Set(hashtagMatches.map(m => m.slice(1).toLowerCase()))];

    // Process content: escape HTML, linkify mentions and hashtags
    const { html: processedContent, mentions } = await service.processContent(db, content, domain);
    // If there's a link or video, append it to content for federation (so other servers can generate their own cards)
    let safeContent = `<p>${processedContent}</p>`;
    if (link_url) {
      safeContent += `<p><a href="${service.escapeHtml(link_url)}">${service.escapeHtml(link_url)}</a></p>`;
    }
    if (video_url) {
      safeContent += `<p><a href="${service.escapeHtml(video_url)}">${service.escapeHtml(video_url)}</a></p>`;
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    // Create Hashtag objects for the Note
    const noteTags = hashtagNames.map(name => new Hashtag({
      name: `#${name}`,
      href: new URL(`https://${domain}/tags/${name}`),
    }));

    // Generate a unique ID for this note
    const noteId = crypto.randomUUID();
    const noteUri = `https://${domain}/users/${user.username}/posts/${noteId}`;
    const noteUrl = `https://${domain}/@${user.username}/posts/${noteId}`;

    // Build attachments for ActivityPub Note
    const noteAttachments = (attachments ?? []).map(att => new Document({
      url: new URL(att.url.startsWith("http") ? att.url : `https://${domain}${att.url}`),
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
      tags: noteTags.length > 0 ? noteTags : undefined,
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

    return c.json({ post: await service.enrichPost(db, post, actor?.id, domain, communityDb) });
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
