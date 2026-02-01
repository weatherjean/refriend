/**
 * Posts Service
 *
 * Business logic for posts including enrichment.
 */

import type { DB, PostWithActorAndBooster, BoosterInfo } from "../../db.ts";
import type { Post, PostWithActor, Actor, LinkPreview, VideoEmbed } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import type { EnrichedPost, PostsListResponse, CreatePostInput, AttachmentInput } from "./types.ts";
import { formatDate } from "./types.ts";
import { sanitizeActor } from "../users/types.ts";
import { parseVideoUrl } from "../../video.ts";
import { invalidateProfileCache } from "../../cache.ts";
import { createNotification } from "../notifications/service.ts";

// ============ Content Processing Helpers ============

/**
 * Escape HTML special characters for text content.
 * Only escapes characters that can break HTML structure.
 * Quotes/apostrophes are NOT escaped - they're safe in text content,
 * only dangerous in attributes (which we don't use user input for).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Decode common HTML entities
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

/**
 * Process post content: escape HTML, convert newlines, linkify mentions and hashtags
 */
export async function processContent(_db: DB, text: string, domain: string): Promise<{ html: string; mentions: string[] }> {
  // First escape HTML
  let html = escapeHtml(text);

  // Extract mentions before converting (to return them)
  const mentionMatches = text.match(/@[\w.-]+(?:@[\w.-]+)?/g) || [];
  const mentions = [...new Set(mentionMatches.map(m => m.startsWith('@') ? m : `@${m}`))];

  // Convert @mentions to links
  // Match @username or @username@domain
  html = html.replace(/@([\w.-]+(?:@[\w.-]+)?)/g, (_match, handle: string) => {
    if (!handle.includes('@')) {
      // Local mention — absolute URL with canonical /@username path
      return `<a href="https://${domain}/@${handle}" class="mention">@${handle}</a>`;
    }
    // Remote mention — link to their home instance profile
    const [user, remoteDomain] = handle.split('@');
    return `<a href="https://${remoteDomain}/@${user}" class="mention">@${handle}</a>`;
  });

  // Convert #hashtags to links
  html = html.replace(/#([\w]+)/g, '<a href="/tags/$1" class="hashtag">#$1</a>');

  // Convert newlines to <br>
  html = html.replace(/\n/g, "<br>");

  return { html, mentions };
}

/**
 * Check if a URL points to a private/internal IP address
 */
export function isPrivateUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();

  // Block localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Block private IP ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.x.x.x
    if (a === 10) return true;
    // 172.16.x.x - 172.31.x.x
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.x.x
    if (a === 192 && b === 168) return true;
    // 169.254.x.x (link-local)
    if (a === 169 && b === 254) return true;
  }

  return false;
}

/**
 * Fetch and parse OpenGraph metadata from a URL
 */
export async function fetchOpenGraph(url: string, timeoutMs: number = 3000): Promise<LinkPreview | null> {
  try {
    const parsedUrl = new URL(url);

    // Only allow http/https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    // Block private/internal URLs
    if (isPrivateUrl(parsedUrl)) {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Riff/1.0 (OpenGraph fetcher)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return null;
      }

      const html = await response.text();

      // Parse OpenGraph tags using regex (simple approach, no external deps)
      const getMetaContent = (property: string): string | null => {
        // Try og:property first
        const ogMatch = html.match(new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${property}["']`, 'i'));
        if (ogMatch) return ogMatch[1];

        // Fallback to twitter:property
        const twitterMatch = html.match(new RegExp(`<meta[^>]*name=["']twitter:${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:${property}["']`, 'i'));
        if (twitterMatch) return twitterMatch[1];

        return null;
      };

      // Get title (og:title, twitter:title, or <title>)
      let title = getMetaContent('title');
      if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : null;
      }

      const description = getMetaContent('description');
      let image = getMetaContent('image');
      const siteName = getMetaContent('site_name');

      // Make image URL absolute if relative
      if (image && !image.startsWith('http')) {
        try {
          image = new URL(image, url).href;
        } catch {
          image = null;
        }
      }

      // Must have at least a title to be useful
      if (!title) {
        return null;
      }

      return {
        url,
        title: decodeHtmlEntities(title),
        description: description ? decodeHtmlEntities(description) : null,
        image,
        site_name: siteName ? decodeHtmlEntities(siteName) : null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // Timeout, network error, or parsing error - fail gracefully
    return null;
  }
}

// ============ Post Creation/Deletion ============

export interface CreatePostResult {
  success: boolean;
  post?: Post;
  error?: string;
}

export interface CreatePostParams {
  content: string;
  inReplyTo?: string;
  attachments?: AttachmentInput[];
  sensitive?: boolean;
  linkUrl?: string;
  videoUrl?: string;
}

/**
 * Validate post creation input
 */
export async function validateCreatePost(
  db: DB,
  params: CreatePostParams,
): Promise<{ valid: boolean; error?: string; replyToPost?: Post; linkPreview?: LinkPreview | null; videoEmbed?: VideoEmbed | null }> {
  const { content, inReplyTo, attachments, linkUrl, videoUrl } = params;

  if (!content?.trim()) {
    return { valid: false, error: "Content required" };
  }

  // Content length limit (500 chars like Mastodon)
  if (content.length > 500) {
    return { valid: false, error: "Content too long (max 500 characters)" };
  }

  // Validate attachments (max 4)
  if (attachments && attachments.length > 4) {
    return { valid: false, error: "Maximum 4 attachments allowed" };
  }

  // Link, video, and attachments are mutually exclusive
  if (linkUrl && attachments && attachments.length > 0) {
    return { valid: false, error: "Cannot have both link and attachments" };
  }
  if (videoUrl && attachments && attachments.length > 0) {
    return { valid: false, error: "Cannot have both video and attachments" };
  }
  if (linkUrl && videoUrl) {
    return { valid: false, error: "Cannot have both link and video" };
  }

  // Validate and fetch OpenGraph data for link
  let linkPreview: LinkPreview | null = null;
  if (linkUrl) {
    try {
      new URL(linkUrl); // Validate URL format
    } catch {
      return { valid: false, error: "Invalid link URL" };
    }
    linkPreview = await fetchOpenGraph(linkUrl);
    if (!linkPreview) {
      linkPreview = { url: linkUrl, title: null, description: null, image: null, site_name: null };
    }
  }

  // Validate and parse video URL
  let videoEmbed: VideoEmbed | null = null;
  if (videoUrl) {
    try {
      new URL(videoUrl); // Validate URL format
    } catch {
      return { valid: false, error: "Invalid video URL" };
    }
    videoEmbed = parseVideoUrl(videoUrl);
    if (!videoEmbed) {
      return { valid: false, error: "Unsupported video platform. Supported: YouTube, TikTok, PeerTube" };
    }
    // For PeerTube, fetch the OG image as thumbnail since static paths vary
    if (videoEmbed.platform === 'peertube') {
      const ogData = await fetchOpenGraph(videoUrl);
      if (ogData?.image) {
        videoEmbed.thumbnailUrl = ogData.image;
      }
    }
  }

  // Check if replying to a valid post
  let replyToPost: Post | undefined;
  if (inReplyTo) {
    replyToPost = await db.getPostByPublicId(inReplyTo) ?? undefined;
    if (!replyToPost) {
      return { valid: false, error: "Parent post not found" };
    }
  }

  return { valid: true, replyToPost, linkPreview, videoEmbed };
}

/**
 * Notify mentioned users about a post (batch lookup for efficiency)
 */
export async function notifyMentions(
  db: DB,
  mentions: string[],
  authorActorId: number,
  postId: number,
  domain: string
): Promise<void> {
  // Parse and filter mentions to local users only
  const localMentions = mentions
    .map(m => m.match(/^@([\w.-]+)(?:@([\w.-]+))?$/))
    .filter((match): match is RegExpMatchArray => {
      if (!match) return false;
      const mentionDomain = match[2];
      return !mentionDomain || mentionDomain === domain;
    })
    .map(match => match[1].toLowerCase());

  const uniqueMentions = [...new Set(localMentions)];
  if (uniqueMentions.length === 0) return;

  // Batch fetch all mentioned actors (single query)
  const actorsMap = await db.getActorsByUsernames(uniqueMentions);

  // Create notifications
  for (const [, actor] of actorsMap) {
    if (actor.id !== authorActorId) {
      await createNotification(db, 'mention', authorActorId, actor.id, postId);
    }
  }
}

// ============ Post Enrichment ============

/**
 * Enrich a single post with all the data needed for display
 */
export async function enrichPost(
  db: DB,
  post: Post,
  currentActorId?: number,
  domain?: string,
): Promise<EnrichedPost> {
  const author = await db.getActorById(post.actor_id);
  const postWithActor: PostWithActor = { ...post, author: author! };
  const enriched = await enrichPostsBatch(db, [postWithActor], currentActorId, domain);
  return enriched[0];
}

/**
 * Enrich multiple posts efficiently with batch queries
 */
export async function enrichPostsBatch(
  db: DB,
  posts: PostWithActor[],
  currentActorId?: number,
  domain?: string,
): Promise<EnrichedPost[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  // Batch fetch all related data
  const [hashtagsMap, mediaMap, likedSet, boostedSet, pinnedSet] = await Promise.all([
    repository.getBatchHashtags(db, postIds),
    repository.getBatchPostMedia(db, postIds),
    currentActorId ? db.getLikedPostIds(currentActorId, postIds) : Promise.resolve(new Set<number>()),
    currentActorId ? db.getBoostedPostIds(currentActorId, postIds) : Promise.resolve(new Set<number>()),
    currentActorId ? db.getPinnedPostIds(currentActorId, postIds) : Promise.resolve(new Set<number>()),
  ]);

  // Collect parent post IDs for replies
  const parentPostIds = posts
    .filter((p) => p.in_reply_to_id)
    .map((p) => p.in_reply_to_id!);

  // Fetch parent posts if needed
  const parentPostsMap = new Map<number, PostWithActor>();
  if (parentPostIds.length > 0) {
    const uniqueParentIds = [...new Set(parentPostIds)];
    const parentPostsByIdMap = await db.getPostsByIds(uniqueParentIds);
    const parentPosts = [...parentPostsByIdMap.values()];
    const parentActorIds = [...new Set(parentPosts.map((p) => p.actor_id))];
    const parentActors = await db.getActorsByIds(parentActorIds);

    for (const parent of parentPosts) {
      parentPostsMap.set(parent.id, {
        ...parent,
        author: parentActors.get(parent.actor_id)!,
      });
    }
  }

  return posts.map((post) => {
    const parentPost = post.in_reply_to_id ? parentPostsMap.get(post.in_reply_to_id) : null;

    return {
      id: post.public_id,
      uri: post.uri,
      type: post.type || 'Note',
      title: post.title || null,
      content: post.content,
      url: post.url,
      created_at: formatDate(post.created_at),
      author: post.author ? sanitizeActor(post.author, domain) : null,
      hashtags: hashtagsMap.get(post.id) ?? [],
      likes_count: post.likes_count ?? 0,
      boosts_count: (post as Post & { boosts_count?: number }).boosts_count ?? 0,
      liked: likedSet.has(post.id),
      boosted: boostedSet.has(post.id),
      pinned: pinnedSet.has(post.id),
      replies_count: post.replies_count ?? 0,
      in_reply_to: parentPost ? {
        id: parentPost.public_id,
        uri: parentPost.uri,
        content: parentPost.content,
        url: parentPost.url,
        created_at: formatDate(parentPost.created_at),
        author: parentPost.author ? sanitizeActor(parentPost.author, domain) : null,
        likes_count: parentPost.likes_count ?? 0,
        boosts_count: (parentPost as Post & { boosts_count?: number }).boosts_count ?? 0,
        replies_count: parentPost.replies_count ?? 0,
      } : null,
      sensitive: post.sensitive ?? false,
      attachments: mediaMap.get(post.id) ?? [],
      link_preview: post.link_preview,
      video_embed: post.video_embed,
      addressed_to: post.addressed_to ?? null,
    };
  });
}

// ============ Post Retrieval ============

/**
 * Get recent posts (public feed)
 */
export async function getRecentPosts(
  db: DB,
  limit: number,
  before?: number,
  currentActorId?: number,
  domain?: string,
): Promise<PostsListResponse> {
  const posts = await repository.getRecentPosts(db, limit + 1, before);
  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0 ? resultPosts[resultPosts.length - 1].id : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  return {
    posts: enrichedPosts,
    next_cursor: nextCursor,
  };
}

/**
 * Get timeline posts for authenticated user
 */
export async function getTimelinePosts(
  db: DB,
  actorId: number,
  limit: number,
  before?: number,
  domain?: string,
): Promise<PostsListResponse> {
  const posts = await repository.getTimelinePosts(db, actorId, limit + 1, before);
  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].id
    : null;

  // Build a map of post id -> booster info for posts that were boosted into the timeline
  const boosterMap = new Map<number, BoosterInfo>();
  for (const post of resultPosts) {
    if (post.booster) {
      boosterMap.set(post.id, post.booster);
    }
  }

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, actorId, domain);

  // Attach booster info to enriched posts
  for (const enrichedPost of enrichedPosts) {
    // Find the original post by public_id to get internal id
    const originalPost = resultPosts.find(p => p.public_id === enrichedPost.id);
    if (originalPost && boosterMap.has(originalPost.id)) {
      const booster = boosterMap.get(originalPost.id)!;
      enrichedPost.boosted_by = {
        id: booster.public_id,
        handle: booster.handle,
        name: booster.name,
        avatar_url: booster.avatar_url,
        actor_type: booster.actor_type,
      };
    }
  }

  return {
    posts: enrichedPosts,
    next_cursor: nextCursor,
  };
}

/**
 * Get a single post by public ID
 */
export async function getPost(
  db: DB,
  publicId: string,
  currentActorId?: number,
  domain?: string,
): Promise<EnrichedPost | null> {
  const post = await repository.getPostByPublicId(db, publicId);
  if (!post) return null;
  const enriched = await enrichPost(db, post, currentActorId, domain);

  // Attach boost attribution (e.g. Group that shared this post)
  const boosters = await db.getPostBoosters(post.id, 1);
  if (boosters.length > 0) {
    const booster = boosters[0];
    enriched.boosted_by = {
      id: booster.public_id,
      handle: booster.handle,
      name: booster.name,
      avatar_url: booster.avatar_url,
      actor_type: booster.actor_type,
    };
  }

  return enriched;
}

/**
 * Search posts
 */
export async function searchPosts(
  db: DB,
  query: string,
  limit: number,
  currentActorId?: number,
  domain?: string,
): Promise<EnrichedPost[]> {
  const posts = await repository.searchPosts(db, query, limit);
  return enrichPostsBatch(db, posts, currentActorId, domain);
}

/**
 * Get posts by hashtag
 */
export async function getPostsByHashtag(
  db: DB,
  hashtag: string,
  limit: number,
  before?: number,
  currentActorId?: number,
  domain?: string,
): Promise<PostsListResponse> {
  const posts = await repository.getPostsByHashtag(db, hashtag, limit + 1, before);
  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0 ? resultPosts[resultPosts.length - 1].id : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  return {
    posts: enrichedPosts,
    next_cursor: nextCursor,
  };
}

// ============ Pin Operations ============

export async function pinPost(
  db: DB,
  actorId: number,
  postId: number
): Promise<{ success: boolean; error?: string }> {
  const pinnedCount = await repository.getPinnedPostsCount(db, actorId);
  // Only check limit if the post isn't already pinned (matches original api.ts behavior)
  if (pinnedCount >= 5 && !(await repository.isPinned(db, actorId, postId))) {
    return { success: false, error: "Cannot pin more than 5 posts" };
  }

  await repository.pinPost(db, actorId, postId);
  return { success: true };
}

export async function unpinPost(
  db: DB,
  actorId: number,
  postId: number
): Promise<{ success: boolean }> {
  await repository.unpinPost(db, actorId, postId);
  return { success: true };
}

// ============ Report Operations ============

export async function reportPost(
  db: DB,
  postId: number,
  reporterId: number,
  reason: string,
  details?: string
): Promise<{ success: boolean; error?: string }> {
  const validReasons = ['spam', 'harassment', 'hate_speech', 'violence', 'misinformation', 'other'];
  if (!validReasons.includes(reason)) {
    return { success: false, error: "Invalid reason" };
  }

  // Note: repository expects (db, postId, reporterId, reason, details)
  await repository.createReport(db, postId, reporterId, reason, details ?? null);
  return { success: true };
}
