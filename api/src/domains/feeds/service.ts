/**
 * Feeds Service
 *
 * Business logic for user-moderated curated feeds.
 */

import type { DB } from "../../db.ts";
import type { Feed } from "./repository.ts";
import * as repository from "./repository.ts";
import { enrichPostsBatch } from "../posts/service.ts";

// ============ Discover Cache ============

const DISCOVER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let discoverCache: {
  trending: (Feed & { bookmark_count: number })[];
  popular: (Feed & { bookmark_count: number })[];
  cachedAt: number;
} | null = null;

export async function getDiscoverFeeds(db: DB) {
  const now = Date.now();
  if (discoverCache && (now - discoverCache.cachedAt) < DISCOVER_CACHE_TTL) {
    return { trending: discoverCache.trending, popular: discoverCache.popular };
  }

  const [trending, popular] = await Promise.all([
    repository.getTrendingFeeds(db, 30, 48),
    repository.getPopularFeeds(db, 30),
  ]);

  discoverCache = { trending, popular, cachedAt: now };
  return { trending, popular };
}

export async function getFeedContent(
  db: DB,
  feedId: number,
  limit: number,
  before: number | undefined,
  actorId: number | undefined,
  domain: string,
) {
  const posts = await repository.getFeedPosts(db, feedId, limit + 1, before);
  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].feed_post_id
    : null;

  return {
    posts: await enrichPostsBatch(db, resultPosts, actorId, domain),
    next_cursor: nextCursor,
  };
}

export async function getSuggestionContent(
  db: DB,
  feedId: number,
  limit: number,
  before: number | undefined,
  actorId: number | undefined,
  domain: string,
) {
  const rows = await repository.getPendingSuggestionsEnriched(db, feedId, limit + 1, before);
  const hasMore = rows.length > limit;
  const resultRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && resultRows.length > 0
    ? resultRows[resultRows.length - 1].suggestion_id
    : null;

  const enriched = await enrichPostsBatch(db, resultRows.map(r => r.post), actorId, domain);

  return {
    suggestions: resultRows.map((r, i) => ({
      id: r.suggestion_id,
      post: enriched[i],
    })),
    next_cursor: nextCursor,
  };
}

export async function approveSuggestion(
  db: DB,
  suggestionId: number,
  feedId: number,
  actorId: number,
): Promise<void> {
  await db.query(async (client) => {
    const result = await client.queryObject<{ id: number; feed_id: number; post_id: number; status: string }>`
      SELECT id, feed_id, post_id, status FROM feed_suggestions WHERE id = ${suggestionId}
    `;
    const suggestion = result.rows[0];
    if (!suggestion || suggestion.feed_id !== feedId || suggestion.status !== 'pending') {
      throw new Error("Suggestion not found or already processed");
    }

    await client.queryArray`
      UPDATE feed_suggestions SET status = 'approved' WHERE id = ${suggestionId}
    `;
    await client.queryArray`
      INSERT INTO feed_posts (feed_id, post_id, added_by_actor_id)
      VALUES (${feedId}, ${suggestion.post_id}, ${actorId})
      ON CONFLICT DO NOTHING
    `;
  });
}

export async function rejectSuggestion(
  db: DB,
  suggestionId: number,
  feedId: number,
): Promise<void> {
  await db.query(async (client) => {
    const result = await client.queryObject<{ id: number; feed_id: number; status: string }>`
      SELECT id, feed_id, status FROM feed_suggestions WHERE id = ${suggestionId}
    `;
    const suggestion = result.rows[0];
    if (!suggestion || suggestion.feed_id !== feedId || suggestion.status !== 'pending') {
      throw new Error("Suggestion not found or already processed");
    }

    await client.queryArray`
      UPDATE feed_suggestions SET status = 'rejected' WHERE id = ${suggestionId}
    `;
  });
}
