/**
 * Tags Service
 *
 * Business logic for hashtag discovery and trending tags.
 */

import type { DB } from "../../db.ts";

// In-memory cache for tags
let trendingCache: { tags: { name: string; count: number }[]; cachedAt: number; fetchedLimit: number } | null = null;
let popularCache: { tags: { name: string; count: number }[]; cachedAt: number; fetchedLimit: number } | null = null;
const TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface TagInfo {
  name: string;
  count: number;
}

export async function searchTags(db: DB, query: string, limit = 10): Promise<TagInfo[]> {
  if (!query.trim()) {
    return [];
  }
  return await db.searchTags(query, limit);
}

const MAX_CACHED_TAGS = 50;

export async function getPopularTags(db: DB, limit = 10): Promise<TagInfo[]> {
  const now = Date.now();

  if (popularCache && (now - popularCache.cachedAt) < TAGS_CACHE_TTL) {
    if (popularCache.tags.length >= limit || popularCache.fetchedLimit >= limit) {
      return popularCache.tags.slice(0, limit);
    }
  }

  const fetchLimit = Math.max(limit, MAX_CACHED_TAGS);
  const tags = await db.getPopularTags(fetchLimit);
  popularCache = { tags, cachedAt: now, fetchedLimit: fetchLimit };
  return tags.slice(0, limit);
}

export async function getTrendingTags(db: DB, limit = 10, hours = 48): Promise<TagInfo[]> {
  const now = Date.now();

  if (trendingCache && (now - trendingCache.cachedAt) < TAGS_CACHE_TTL) {
    if (trendingCache.tags.length >= limit || trendingCache.fetchedLimit >= limit) {
      return trendingCache.tags.slice(0, limit);
    }
  }

  const fetchLimit = Math.max(limit, MAX_CACHED_TAGS);
  const tags = await db.getTrendingTags(fetchLimit, hours);
  trendingCache = { tags, cachedAt: now, fetchedLimit: fetchLimit };
  return tags.slice(0, limit);
}

// ============ Hashtag Bookmarks ============

export async function getBookmarkedHashtags(db: DB, actorId: number): Promise<TagInfo[]> {
  return await db.getBookmarkedHashtags(actorId);
}

export async function getBookmarkedFeed(db: DB, actorId: number, limit = 20, before?: number) {
  return await db.getBookmarkedHashtagFeed(actorId, limit, before);
}

export async function bookmarkTag(db: DB, actorId: number, tagName: string): Promise<void> {
  const hashtag = await db.getOrCreateHashtag(tagName);
  await db.addHashtagBookmark(actorId, hashtag.id);
}

export async function unbookmarkTag(db: DB, actorId: number, tagName: string): Promise<void> {
  const hashtag = await db.getHashtagByName(tagName);
  if (!hashtag) return;
  await db.removeHashtagBookmark(actorId, hashtag.id);
}

// For testing - clear caches
export function clearTagCaches(): void {
  trendingCache = null;
  popularCache = null;
}
