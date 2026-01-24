/**
 * Tags Service
 *
 * Business logic for hashtag discovery and trending tags.
 */

import type { DB } from "../../db.ts";

// In-memory cache for tags
let trendingCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
let popularCache: { tags: { name: string; count: number }[]; cachedAt: number } | null = null;
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

export async function getPopularTags(db: DB, limit = 10): Promise<TagInfo[]> {
  const now = Date.now();

  if (popularCache && (now - popularCache.cachedAt) < TAGS_CACHE_TTL) {
    return popularCache.tags;
  }

  const tags = await db.getPopularTags(limit);
  popularCache = { tags, cachedAt: now };
  return tags;
}

export async function getTrendingTags(db: DB, limit = 10, hours = 48): Promise<TagInfo[]> {
  const now = Date.now();

  if (trendingCache && (now - trendingCache.cachedAt) < TAGS_CACHE_TTL) {
    return trendingCache.tags;
  }

  const tags = await db.getTrendingTags(limit, hours);
  trendingCache = { tags, cachedAt: now };
  return tags;
}

// For testing - clear caches
export function clearTagCaches(): void {
  trendingCache = null;
  popularCache = null;
}
