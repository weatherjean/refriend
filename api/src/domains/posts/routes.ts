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
  Mention,
  Note,
  Page,
  Tombstone,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Federation } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as service from "./service.ts";
import { sanitizeActor } from "../users/types.ts";
import { getCachedHashtagPosts, setCachedHashtagPosts, invalidateProfileCache } from "../../cache.ts";
import { saveMedia, deleteMedia } from "../../storage.ts";
import { safeSendActivity, sendToCommunity } from "../federation-v2/index.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";
import { parseIntSafe } from "../../shared/utils.ts";

interface PostsEnv {
  Variables: {
    db: DB;
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
      posts: await service.enrichPostsBatch(db, resultPosts, currentActor?.id, domain),
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
    const domain = c.get("domain");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const offset = parseIntSafe(c.req.query("offset")) ?? undefined;

    const result = await service.getTimelinePosts(db, actor.id, limit, undefined, "hot", domain, undefined, offset);
    return c.json(result);
  });

  // GET /timeline - Get authenticated user's timeline
  routes.get("/timeline", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 20, 50);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;
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

    // Get ancestor chain using batch fetch (single recursive CTE query)
    const ancestorPosts = await db.getAncestorChainWithActor(post.id, 50);
    const ancestors = await service.enrichPostsBatch(db, ancestorPosts, currentActor?.id, domain);

    // Enrich the main post
    const enrichedPost = await service.enrichPost(db, post, currentActor?.id, domain);

    // Attach boost attribution (e.g. Group that shared this post)
    const boosters = await db.getPostBoosters(post.id, 1);
    if (boosters.length > 0) {
      const booster = boosters[0];
      enrichedPost.boosted_by = {
        id: booster.public_id,
        handle: booster.handle,
        name: booster.name,
        avatar_url: booster.avatar_url,
        actor_type: booster.actor_type,
      };
    }

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
      replies: await service.enrichPostsBatch(db, resultReplies, currentActor?.id, domain),
      next_cursor: nextCursor,
      op_author_id: parentAuthor?.public_id || null,
    });
  });

  // GET /posts/:id/likers - Get actors who liked a post
  routes.get("/posts/:id/likers", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const likers = await db.getPostLikers(post.id);
    return c.json({ likers: likers.map(a => sanitizeActor(a, domain)) });
  });

  // GET /posts/:id/boosters - Get actors who boosted a post
  routes.get("/posts/:id/boosters", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");

    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    const boosters = await db.getPostBoosters(post.id);
    return c.json({ boosters: boosters.map(a => sanitizeActor(a, domain)) });
  });

  // GET /hashtag/:tag - Get posts by hashtag
  routes.get("/hashtag/:tag", async (c) => {
    const tag = c.req.param("tag").toLowerCase();
    const db = c.get("db");
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

  // POST /posts - Create post (V2: direct database + send)
  routes.post("/posts", rateLimit("post:create"), async (c) => {
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
    // deno-lint-ignore no-explicit-any
    const noteTags: any[] = hashtagNames.map(name => new Hashtag({
      name: `#${name}`,
      href: new URL(`https://${domain}/tags/${name}`),
    }));

    // Look up mentioned actors and create Mention tags
    const mentionedActors: Actor[] = [];
    for (const mention of mentions) {
      const match = mention.match(/^@([\w.-]+)(?:@([\w.-]+))?$/);
      if (!match) continue;
      const [, username, mentionDomain] = match;

      // Build handle to look up
      const handle = mentionDomain
        ? `@${username}@${mentionDomain}`
        : `@${username}@${domain}`;

      const mentionedActor = await db.getActorByHandle(handle);
      if (mentionedActor) {
        mentionedActors.push(mentionedActor);
        noteTags.push(new Mention({
          href: new URL(mentionedActor.uri),
          name: handle,
        }));
      }
    }

    // Generate a unique ID for this note
    const noteId = crypto.randomUUID();
    const noteUri = `https://${domain}/@${user.username}/posts/${noteId}`;
    const noteUrl = noteUri;

    // Build attachments for ActivityPub Note
    const noteAttachments = (attachments ?? []).map(att => new Document({
      url: new URL(att.url.startsWith("http") ? att.url : `https://${domain}${att.url}`),
      mediaType: "image/webp",
      name: att.alt_text ?? null,
      width: att.width,
      height: att.height,
    }));

    // Determine audience: inherited from reply parent (community thread replies)
    let audienceUri: URL | undefined;
    const ccRecipients: URL[] = [ctx.getFollowersUri(user.username)];

    if (replyToPost?.addressed_to && replyToPost.addressed_to.length > 0) {
      // Inherit audience from parent post (reply in community thread)
      audienceUri = new URL(replyToPost.addressed_to[0]);
      ccRecipients.push(audienceUri);
      console.log(`[Create] Reply inherits audience: ${audienceUri.href}`);
    }

    // Add parent post author to cc so they get notified of the reply
    let replyToAuthor: Actor | null = null;
    if (replyToPost) {
      replyToAuthor = await db.getActorById(replyToPost.actor_id);
      if (replyToAuthor) {
        ccRecipients.push(new URL(replyToAuthor.uri));
      }
    }

    // Add mentioned actors to cc (avoid duplicates with replyToAuthor)
    for (const mentionedActor of mentionedActors) {
      if (!replyToAuthor || mentionedActor.id !== replyToAuthor.id) {
        ccRecipients.push(new URL(mentionedActor.uri));
      }
    }

    // V2: Create post directly in database
    const post = await db.createPost({
      public_id: noteId,
      uri: noteUri,
      actor_id: actor.id,
      content: safeContent,
      url: noteUrl,
      in_reply_to_id: replyToPost?.id ?? null,
      sensitive: sensitive ?? false,
      addressed_to: audienceUri ? [audienceUri.href] : undefined,
    });

    // Store hashtags
    for (const name of hashtagNames) {
      const hashtag = await db.getOrCreateHashtag(name);
      await db.addPostHashtag(post.id, hashtag.id);
    }

    // Store media attachments
    for (const att of attachments ?? []) {
      const mediaUrl = att.url.startsWith("http") ? att.url : `https://${domain}${att.url}`;
      await db.createMedia(post.id, mediaUrl, "image/webp", att.alt_text ?? null, att.width, att.height);
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

    // Invalidate the author's profile cache
    await invalidateProfileCache(actor.id);

    // Create notifications for mentioned users
    await service.notifyMentions(db, mentions, actor.id, post.id, domain);

    console.log(`[Create] Post from ${actor.handle}: ${post.id}`);

    // Build the ActivityPub Note object
    const apObject = new Note({
      id: new URL(noteUri),
      attribution: ctx.getActorUri(user.username),
      to: PUBLIC_COLLECTION,
      ccs: ccRecipients,
      content: safeContent,
      url: new URL(noteUrl),
      published: Temporal.Now.instant(),
      replyTarget: replyToPost ? new URL(replyToPost.uri) : undefined,
      attachments: noteAttachments.length > 0 ? noteAttachments : undefined,
      tags: noteTags.length > 0 ? noteTags : undefined,
      sensitive: sensitive ?? false,
      audience: audienceUri,
    });

    // Create the activity
    const createActivity = new Create({
      id: new URL(`${noteUri}#activity`),
      actor: ctx.getActorUri(user.username),
      object: apObject,
      to: PUBLIC_COLLECTION,
      ccs: ccRecipients,
    });

    // Send to followers (async — don't block on this)
    await safeSendActivity(ctx,
      { identifier: user.username },
      "followers",
      createActivity,
      { preferSharedInbox: true }
    );
    console.log(`[Create] Sent to followers of ${user.username}`);

    // Send to reply target author (if remote) - Fedify requires separate call
    if (replyToAuthor && replyToAuthor.inbox_url && !replyToAuthor.user_id) {
      await safeSendActivity(ctx,
        { identifier: user.username },
        { id: new URL(replyToAuthor.uri), inboxId: new URL(replyToAuthor.inbox_url) },
        createActivity
      );
      console.log(`[Create] Sent reply to ${replyToAuthor.handle}`);
    }

    // Send to mentioned actors (if remote and not already sent as replyToAuthor)
    for (const mentionedActor of mentionedActors) {
      if (mentionedActor.inbox_url && !mentionedActor.user_id) {
        // Skip if same as replyToAuthor (already sent)
        if (replyToAuthor && mentionedActor.id === replyToAuthor.id) continue;
        await safeSendActivity(ctx,
          { identifier: user.username },
          { id: new URL(mentionedActor.uri), inboxId: new URL(mentionedActor.inbox_url) },
          createActivity
        );
        console.log(`[Create] Sent mention to ${mentionedActor.handle}`);
      }
    }

    // For replies in community threads, send to community
    if (audienceUri) {
      await sendToCommunity(ctx, user.username, createActivity, audienceUri.href);
    }

    return c.json({ post: await service.enrichPost(db, post, actor?.id, domain) });
  });

  // POST /posts/:id/submit-to-community - Submit existing post to a Lemmy community
  routes.post("/posts/:id/submit-to-community", async (c) => {
    const publicId = c.req.param("id");
    const user = c.get("user");
    const actor = c.get("actor");
    const domain = c.get("domain");
    const db = c.get("db");

    if (!user || !actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { title, community } = await c.req.json<{
      title: string;
      community: string;
    }>();

    // Validate title
    if (!title?.trim()) {
      return c.json({ error: "Title is required" }, 400);
    }
    if (title.length > 200) {
      return c.json({ error: "Title too long (max 200 characters)" }, 400);
    }

    // Validate community URL
    if (!community) {
      return c.json({ error: "Community is required" }, 400);
    }
    try {
      new URL(community);
    } catch {
      return c.json({ error: "Invalid community URL" }, 400);
    }

    // Fetch the post
    const post = await db.getPostByPublicId(publicId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Verify ownership
    if (post.actor_id !== actor.id) {
      return c.json({ error: "Not authorized" }, 403);
    }

    // Guard: reject if already a Page
    if (post.type === 'Page') {
      return c.json({ error: "Post has already been submitted to a community" }, 400);
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    // Build a Page AP object from the existing post
    const audienceUri = new URL(community);
    const ccRecipients: URL[] = [ctx.getFollowersUri(user.username), audienceUri];

    const pageObject = new Page({
      id: new URL(post.uri),
      attribution: ctx.getActorUri(user.username),
      to: PUBLIC_COLLECTION,
      ccs: ccRecipients,
      content: post.content,
      name: title.trim(),
      url: new URL(post.url || post.uri),
      published: Temporal.Instant.from(new Date(post.created_at).toISOString()),
      sensitive: post.sensitive,
      audience: audienceUri,
    });

    const createActivity = new Create({
      id: new URL(`${post.uri}#submit-community`),
      actor: ctx.getActorUri(user.username),
      object: pageObject,
      to: PUBLIC_COLLECTION,
      ccs: ccRecipients,
    });

    // Send synchronously — fail if community rejects
    const result = await sendToCommunity(ctx, user.username, createActivity, community);
    if (!result.ok) {
      return c.json({ error: result.error || "Failed to send to community" }, 502);
    }

    // Success: update local post
    await db.updatePostTitleAndType(post.id, title.trim(), 'Page');
    await db.updatePostAddressedTo(post.id, [community]);

    console.log(`[SubmitToCommunity] Post ${post.id} submitted to ${community}`);

    return c.json({ post: await service.enrichPost(db, { ...post, type: 'Page', title: title.trim(), addressed_to: [community] }, actor?.id, domain) });
  });

  // DELETE /posts/:id - Delete post (V2: direct database + send)
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

    // Get reply target author before deleting (if this is a reply)
    let deleteReplyToAuthor: Actor | null = null;
    if (post.in_reply_to_id) {
      const parentPost = await db.getPostById(post.in_reply_to_id);
      if (parentPost) {
        deleteReplyToAuthor = await db.getActorById(parentPost.actor_id);
      }
    }

    const ctx = federation.createContext(c.req.raw, undefined);

    // V2: Delete post directly from database
    await db.deletePost(post.id);
    console.log(`[Delete] Post ${post.id} by ${actor.handle}`);

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

    // Build cc and audience for the Delete activity
    const deleteCc: URL[] = [ctx.getFollowersUri(user.username)];
    let deleteAudience: URL | undefined;
    if (post.addressed_to && post.addressed_to.length > 0) {
      deleteAudience = new URL(post.addressed_to[0]);
      deleteCc.push(deleteAudience);
    }
    // Add reply target author to cc
    if (deleteReplyToAuthor) {
      deleteCc.push(new URL(deleteReplyToAuthor.uri));
    }

    // Create the Delete activity
    const deleteActivity = new Delete({
      id: new URL(`https://${domain}/#deletes/${crypto.randomUUID()}`),
      actor: ctx.getActorUri(user.username),
      object: new Tombstone({
        id: new URL(post.uri),
      }),
      to: PUBLIC_COLLECTION,
      ccs: deleteCc,
      audience: deleteAudience,
    });

    // Send to followers
    await safeSendActivity(ctx,
      { identifier: user.username },
      "followers",
      deleteActivity
    );
    console.log(`[Delete] Sent to followers of ${user.username}`);

    // Send to reply target author (if remote)
    if (deleteReplyToAuthor && deleteReplyToAuthor.inbox_url && !deleteReplyToAuthor.user_id) {
      await safeSendActivity(ctx,
        { identifier: user.username },
        { id: new URL(deleteReplyToAuthor.uri), inboxId: new URL(deleteReplyToAuthor.inbox_url) },
        deleteActivity
      );
      console.log(`[Delete] Sent to reply author ${deleteReplyToAuthor.handle}`);
    }

    // Send to communities via manual signing (for Lemmy compatibility)
    if (post.addressed_to && post.addressed_to.length > 0) {
      for (const communityUri of post.addressed_to) {
        await sendToCommunity(ctx, user.username, deleteActivity, communityUri);
      }
    }

    return c.json({ ok: true });
  });

  return routes;
}

// Re-export service functions for use by other modules
export { enrichPost, enrichPostsBatch } from "./service.ts";
