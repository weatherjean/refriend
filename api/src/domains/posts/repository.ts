/**
 * Posts Repository
 *
 * Database operations for posts.
 */

import type { DB, PostWithActorAndBooster } from "../../db.ts";
import type { Post, PostWithActor, LinkPreview, VideoEmbed } from "../../shared/types.ts";

// ============ Read Operations ============

export async function getPostById(db: DB, id: number): Promise<Post | null> {
  return db.getPostById(id);
}

export async function getPostByPublicId(db: DB, publicId: string): Promise<Post | null> {
  return db.getPostByPublicId(publicId);
}

export async function getPostByUri(db: DB, uri: string): Promise<Post | null> {
  return db.getPostByUri(uri);
}

export async function getPostsByActorWithActor(
  db: DB,
  actorId: number,
  limit: number,
  before?: number,
  sort: "new" | "hot" = "new"
): Promise<PostWithActor[]> {
  return db.getPostsByActorWithActor(actorId, limit, before, sort);
}

export async function getRepliesByActorWithActor(
  db: DB,
  actorId: number,
  limit: number,
  before?: number
): Promise<PostWithActor[]> {
  return db.getRepliesByActorWithActor(actorId, limit, before);
}

export async function getReplies(db: DB, postId: number): Promise<PostWithActor[]> {
  return db.getRepliesWithActor(postId);
}

export async function getRecentPosts(
  db: DB,
  limit: number,
  before?: number
): Promise<PostWithActor[]> {
  return db.getPublicTimelineWithActor(limit, before);
}

export async function getHotPosts(db: DB, limit: number): Promise<PostWithActor[]> {
  return db.getHotPosts(limit);
}

export async function getTimelinePosts(
  db: DB,
  actorId: number,
  limit: number,
  before?: number,
  sort: "new" | "hot" = "new"
): Promise<PostWithActorAndBooster[]> {
  return db.getHomeFeedWithActor(actorId, limit, before, sort);
}

export async function getPostMedia(db: DB, postId: number): Promise<Array<{
  id: number;
  url: string;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}>> {
  return db.getMediaByPostId(postId);
}

export async function getBatchPostMedia(db: DB, postIds: number[]): Promise<Map<number, Array<{
  id: number;
  url: string;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}>>> {
  return db.getMediaForPosts(postIds);
}

export async function getHashtags(db: DB, postId: number): Promise<string[]> {
  const hashtags = await db.getPostHashtags(postId);
  return hashtags.map(h => h.name);
}

export async function getBatchHashtags(db: DB, postIds: number[]): Promise<Map<number, string[]>> {
  return db.getHashtagsForPosts(postIds);
}

export async function getRepliesCount(db: DB, postId: number): Promise<number> {
  return db.getRepliesCount(postId);
}

export async function searchPosts(
  db: DB,
  query: string,
  limit: number
): Promise<PostWithActor[]> {
  const result = await db.searchPosts(query, limit);
  return result.posts;
}

export async function getPostsByHashtag(
  db: DB,
  hashtag: string,
  limit: number,
  before?: number
): Promise<PostWithActor[]> {
  return db.getPostsByHashtagWithActor(hashtag, limit, before);
}

// ============ Write Operations ============

export async function updatePostLinkPreview(
  db: DB,
  postId: number,
  linkPreview: LinkPreview
): Promise<void> {
  return db.updatePostLinkPreview(postId, linkPreview);
}

export async function updatePostVideoEmbed(
  db: DB,
  postId: number,
  videoEmbed: VideoEmbed
): Promise<void> {
  return db.updatePostVideoEmbed(postId, videoEmbed);
}

// ============ Pin Operations ============

export async function pinPost(db: DB, actorId: number, postId: number): Promise<void> {
  return db.pinPost(actorId, postId);
}

export async function unpinPost(db: DB, actorId: number, postId: number): Promise<void> {
  return db.unpinPost(actorId, postId);
}

export async function getPinnedPosts(
  db: DB,
  actorId: number
): Promise<PostWithActor[]> {
  return db.getPinnedPostsWithActor(actorId);
}

export async function getPinnedPostsCount(db: DB, actorId: number): Promise<number> {
  return db.getPinnedPostsCount(actorId);
}

export async function isPinned(db: DB, actorId: number, postId: number): Promise<boolean> {
  return db.isPinned(actorId, postId);
}

// ============ Report Operations ============

export async function createReport(
  db: DB,
  postId: number,
  reporterId: number,
  reason: string,
  details: string | null = null
): Promise<void> {
  // db.createReport expects (postId, reporterId, reason, details)
  return db.createReport(postId, reporterId, reason, details);
}

// ============ Batch Operations ============

export async function getPostsByIds(db: DB, ids: number[]): Promise<Map<number, Post>> {
  return db.getPostsByIds(ids);
}

export async function getRepliesCounts(db: DB, postIds: number[]): Promise<Map<number, number>> {
  return db.getRepliesCounts(postIds);
}

// ============ Create/Delete Operations ============

export interface CreatePostInput {
  uri: string;
  actor_id: number;
  content: string;
  url: string | null;
  in_reply_to_id: number | null;
  sensitive: boolean;
}

export async function createPost(db: DB, input: CreatePostInput): Promise<Post> {
  return db.createPost(input);
}

export async function deletePost(db: DB, postId: number): Promise<void> {
  return db.deletePost(postId);
}

// ============ Media Operations ============

export interface CreateMediaInput {
  postId: number;
  url: string;
  mediaType: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export async function createMedia(
  db: DB,
  postId: number,
  url: string,
  mediaType: string,
  altText: string | null = null,
  width: number | null = null,
  height: number | null = null
) {
  return db.createMedia(postId, url, mediaType, altText, width, height);
}

// ============ Hashtag Operations ============

export async function getOrCreateHashtag(db: DB, name: string): Promise<{ id: number; name: string }> {
  return db.getOrCreateHashtag(name);
}

export async function addPostHashtag(db: DB, postId: number, hashtagId: number): Promise<void> {
  return db.addPostHashtag(postId, hashtagId);
}
