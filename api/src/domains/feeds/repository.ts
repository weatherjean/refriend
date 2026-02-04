/**
 * Feeds Repository
 *
 * Database queries for user-moderated curated feeds.
 */

import type { DB, PostWithActor } from "../../db.ts";

export interface Feed {
  id: number;
  public_id: string;
  name: string;
  description: string | null;
  slug: string;
  avatar_url: string | null;
  owner_id: number;
  created_at: string;
}

export interface FeedModerator {
  actor_id: number;
  public_id: string;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface FeedSuggestion {
  id: number;
  feed_id: number;
  post_id: number;
  suggested_by_actor_id: number;
  status: string;
  created_at: string;
  post_public_id: string;
  post_content: string;
  suggester_handle: string;
  suggester_name: string | null;
  suggester_avatar_url: string | null;
}

export interface FeedBookmark {
  feed_id: number;
  slug: string;
  name: string;
  avatar_url: string | null;
  is_owner: boolean;
  is_moderator: boolean;
}

// ============ Feed CRUD ============

export async function createFeed(
  db: DB,
  params: { name: string; description?: string; slug: string; avatar_url?: string; owner_id: number },
): Promise<Feed> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed>`
      INSERT INTO feeds (name, description, slug, avatar_url, owner_id)
      VALUES (${params.name}, ${params.description ?? null}, ${params.slug}, ${params.avatar_url ?? null}, ${params.owner_id})
      RETURNING *
    `;
    return result.rows[0];
  });
}

export async function getFeedByPublicId(db: DB, publicId: string): Promise<Feed | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed>`
      SELECT * FROM feeds WHERE public_id = ${publicId}
    `;
    return result.rows[0] || null;
  });
}

export async function getFeedBySlug(db: DB, slug: string): Promise<Feed | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed>`
      SELECT * FROM feeds WHERE slug = ${slug}
    `;
    return result.rows[0] || null;
  });
}

export async function updateFeed(
  db: DB,
  feedId: number,
  params: { name?: string; description?: string | null; avatar_url?: string | null },
): Promise<Feed> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed>`
      UPDATE feeds SET
        name = COALESCE(${params.name ?? null}, name),
        description = CASE WHEN ${params.description !== undefined} THEN ${params.description ?? null} ELSE description END,
        avatar_url = CASE WHEN ${params.avatar_url !== undefined} THEN ${params.avatar_url ?? null} ELSE avatar_url END
      WHERE id = ${feedId}
      RETURNING *
    `;
    return result.rows[0];
  });
}

export async function deleteFeed(db: DB, feedId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`DELETE FROM feeds WHERE id = ${feedId}`;
  });
}

// ============ Moderators ============

export async function addModerator(db: DB, feedId: number, actorId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO feed_moderators (feed_id, actor_id) VALUES (${feedId}, ${actorId})
      ON CONFLICT DO NOTHING
    `;
  });
}

export async function removeModerator(db: DB, feedId: number, actorId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      DELETE FROM feed_moderators WHERE feed_id = ${feedId} AND actor_id = ${actorId}
    `;
  });
}

export async function getModerators(db: DB, feedId: number): Promise<FeedModerator[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<FeedModerator>`
      SELECT a.id AS actor_id, a.public_id, a.handle, a.name, a.avatar_url, fm.created_at
      FROM feed_moderators fm
      JOIN actors a ON a.id = fm.actor_id
      WHERE fm.feed_id = ${feedId}
      ORDER BY fm.created_at ASC
    `;
    return result.rows;
  });
}

export interface FeedOwner {
  public_id: string;
  handle: string;
  name: string | null;
  avatar_url: string | null;
}

export async function getFeedOwner(db: DB, ownerActorId: number): Promise<FeedOwner | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<FeedOwner>`
      SELECT public_id, handle, name, avatar_url
      FROM actors WHERE id = ${ownerActorId}
    `;
    return result.rows[0] || null;
  });
}

export async function isModeratorOrOwner(db: DB, feedId: number, actorId: number): Promise<boolean> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ found: boolean }>`
      SELECT EXISTS(
        SELECT 1 FROM feeds WHERE id = ${feedId} AND owner_id = ${actorId}
        UNION ALL
        SELECT 1 FROM feed_moderators WHERE feed_id = ${feedId} AND actor_id = ${actorId}
      ) AS found
    `;
    return result.rows[0]?.found ?? false;
  });
}

// ============ Feed Content ============

export async function addPostToFeed(
  db: DB,
  feedId: number,
  postId: number,
  addedByActorId: number,
): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO feed_posts (feed_id, post_id, added_by_actor_id)
      VALUES (${feedId}, ${postId}, ${addedByActorId})
      ON CONFLICT DO NOTHING
    `;
  });
}

export async function removePostFromFeed(db: DB, feedId: number, postId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      DELETE FROM feed_posts WHERE feed_id = ${feedId} AND post_id = ${postId}
    `;
  });
}

export async function getFeedPosts(
  db: DB,
  feedId: number,
  limit: number,
  before?: number,
): Promise<(PostWithActor & { feed_post_id: number })[]> {
  return db.query(async (client) => {
    if (before) {
      const result = await client.queryObject<PostWithActor & { feed_post_id: number }>`
        SELECT p.*, fp.id AS feed_post_id, row_to_json(a.*) AS author
        FROM feed_posts fp
        JOIN posts p ON p.id = fp.post_id
        JOIN actors a ON a.id = p.actor_id
        WHERE fp.feed_id = ${feedId} AND fp.id < ${before}
        ORDER BY fp.id DESC
        LIMIT ${limit}
      `;
      return result.rows;
    }
    const result = await client.queryObject<PostWithActor & { feed_post_id: number }>`
      SELECT p.*, fp.id AS feed_post_id, row_to_json(a.*) AS author
      FROM feed_posts fp
      JOIN posts p ON p.id = fp.post_id
      JOIN actors a ON a.id = p.actor_id
      WHERE fp.feed_id = ${feedId}
      ORDER BY fp.id DESC
      LIMIT ${limit}
    `;
    return result.rows;
  });
}

// ============ Suggestions ============

export async function createSuggestion(
  db: DB,
  feedId: number,
  postId: number,
  suggestedByActorId: number,
): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO feed_suggestions (feed_id, post_id, suggested_by_actor_id)
      VALUES (${feedId}, ${postId}, ${suggestedByActorId})
      ON CONFLICT DO NOTHING
    `;
  });
}

export async function getPendingSuggestions(db: DB, feedId: number): Promise<FeedSuggestion[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<FeedSuggestion>`
      SELECT fs.id, fs.feed_id, fs.post_id, fs.suggested_by_actor_id, fs.status, fs.created_at,
        p.public_id AS post_public_id, p.content AS post_content,
        a.handle AS suggester_handle, a.name AS suggester_name, a.avatar_url AS suggester_avatar_url
      FROM feed_suggestions fs
      JOIN posts p ON p.id = fs.post_id
      JOIN actors a ON a.id = fs.suggested_by_actor_id
      WHERE fs.feed_id = ${feedId} AND fs.status = 'pending'
      ORDER BY fs.created_at ASC
    `;
    return result.rows;
  });
}

export interface SuggestionWithPost {
  suggestion_id: number;
  post: PostWithActor;
}

interface SuggestionRow extends PostWithActor {
  suggestion_id: number;
}

function mapSuggestionRows(rows: SuggestionRow[]): { suggestion_id: number; post: PostWithActor }[] {
  return rows.map((row) => {
    const { suggestion_id, ...post } = row;
    return { suggestion_id, post };
  });
}

export async function getPendingSuggestionsEnriched(
  db: DB,
  feedId: number,
  limit: number,
  before?: number,
): Promise<{ suggestion_id: number; post: PostWithActor }[]> {
  return db.query(async (client) => {
    if (before) {
      const result = await client.queryObject<SuggestionRow>`
        SELECT fs.id AS suggestion_id, p.*, row_to_json(a.*) AS author
        FROM feed_suggestions fs
        JOIN posts p ON p.id = fs.post_id
        JOIN actors a ON a.id = p.actor_id
        WHERE fs.feed_id = ${feedId} AND fs.status = 'pending' AND fs.id < ${before}
        ORDER BY fs.id DESC
        LIMIT ${limit}
      `;
      return mapSuggestionRows(result.rows);
    }
    const result = await client.queryObject<SuggestionRow>`
      SELECT fs.id AS suggestion_id, p.*, row_to_json(a.*) AS author
      FROM feed_suggestions fs
      JOIN posts p ON p.id = fs.post_id
      JOIN actors a ON a.id = p.actor_id
      WHERE fs.feed_id = ${feedId} AND fs.status = 'pending'
      ORDER BY fs.id DESC
      LIMIT ${limit}
    `;
    return mapSuggestionRows(result.rows);
  });
}

export async function getSuggestionById(db: DB, suggestionId: number): Promise<{ id: number; feed_id: number; post_id: number; suggested_by_actor_id: number; status: string } | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ id: number; feed_id: number; post_id: number; suggested_by_actor_id: number; status: string }>`
      SELECT id, feed_id, post_id, suggested_by_actor_id, status
      FROM feed_suggestions WHERE id = ${suggestionId}
    `;
    return result.rows[0] || null;
  });
}

export async function updateSuggestionStatus(db: DB, suggestionId: number, status: 'approved' | 'rejected'): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      UPDATE feed_suggestions SET status = ${status} WHERE id = ${suggestionId}
    `;
  });
}

// ============ Bookmarks ============

export async function bookmarkFeed(db: DB, actorId: number, feedId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO feed_bookmarks (actor_id, feed_id) VALUES (${actorId}, ${feedId})
      ON CONFLICT DO NOTHING
    `;
  });
}

export async function unbookmarkFeed(db: DB, actorId: number, feedId: number): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      DELETE FROM feed_bookmarks WHERE actor_id = ${actorId} AND feed_id = ${feedId}
    `;
  });
}

export async function getBookmarkedFeeds(db: DB, actorId: number): Promise<FeedBookmark[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<FeedBookmark>`
      SELECT f.id AS feed_id, f.slug, f.name, f.avatar_url,
        (f.owner_id = ${actorId}) AS is_owner,
        EXISTS(SELECT 1 FROM feed_moderators fm WHERE fm.feed_id = f.id AND fm.actor_id = ${actorId}) AS is_moderator
      FROM feed_bookmarks fb
      JOIN feeds f ON f.id = fb.feed_id
      WHERE fb.actor_id = ${actorId}
      ORDER BY fb.created_at ASC
    `;
    return result.rows;
  });
}

export async function isBookmarked(db: DB, actorId: number, feedId: number): Promise<boolean> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ found: boolean }>`
      SELECT EXISTS(
        SELECT 1 FROM feed_bookmarks WHERE actor_id = ${actorId} AND feed_id = ${feedId}
      ) AS found
    `;
    return result.rows[0]?.found ?? false;
  });
}

// ============ Discovery ============

export async function searchFeeds(db: DB, query: string, limit = 20): Promise<Feed[]> {
  return db.query(async (client) => {
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const result = await client.queryObject<Feed>`
      SELECT * FROM feeds
      WHERE name ILIKE ${pattern} ESCAPE '\\' OR slug ILIKE ${pattern} ESCAPE '\\' OR description ILIKE ${pattern} ESCAPE '\\'
      ORDER BY name ASC
      LIMIT ${limit}
    `;
    return result.rows;
  });
}

export async function getPopularFeeds(db: DB, limit = 30): Promise<(Feed & { bookmark_count: number })[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed & { bookmark_count: number }>`
      SELECT f.*, COUNT(fb.id)::int AS bookmark_count
      FROM feeds f
      LEFT JOIN feed_bookmarks fb ON fb.feed_id = f.id
      GROUP BY f.id
      ORDER BY bookmark_count DESC, f.created_at DESC
      LIMIT ${limit}
    `;
    return result.rows;
  });
}

export async function getTrendingFeeds(db: DB, limit = 30, hours = 48): Promise<(Feed & { bookmark_count: number })[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed & { bookmark_count: number }>`
      SELECT f.*, COUNT(fb.id)::int AS bookmark_count
      FROM feeds f
      JOIN feed_bookmarks fb ON fb.feed_id = f.id
      WHERE fb.created_at > NOW() - (${hours} || ' hours')::interval
      GROUP BY f.id
      ORDER BY bookmark_count DESC, f.created_at DESC
      LIMIT ${limit}
    `;
    return result.rows;
  });
}

export async function getPostByPublicId(db: DB, publicId: string): Promise<{ id: number } | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ id: number }>`
      SELECT id FROM posts WHERE public_id = ${publicId}
    `;
    return result.rows[0] || null;
  });
}

export async function getModeratedFeeds(db: DB, actorId: number): Promise<(Feed & { bookmark_count: number })[]> {
  return db.query(async (client) => {
    const result = await client.queryObject<Feed & { bookmark_count: number }>`
      SELECT f.*, COALESCE(bc.cnt, 0)::int AS bookmark_count
      FROM feeds f
      LEFT JOIN (
        SELECT feed_id, COUNT(*)::int AS cnt FROM feed_bookmarks GROUP BY feed_id
      ) bc ON bc.feed_id = f.id
      WHERE f.owner_id = ${actorId}
        OR EXISTS(SELECT 1 FROM feed_moderators fm WHERE fm.feed_id = f.id AND fm.actor_id = ${actorId})
      ORDER BY f.name ASC
    `;
    return result.rows;
  });
}

export async function getFeedCountByOwner(db: DB, actorId: number): Promise<number> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM feeds WHERE owner_id = ${actorId}
    `;
    return result.rows[0]?.count ?? 0;
  });
}

export async function getActorByPublicId(db: DB, publicId: string): Promise<{ id: number } | null> {
  return db.query(async (client) => {
    const result = await client.queryObject<{ id: number }>`
      SELECT id FROM actors WHERE public_id = ${publicId}
    `;
    return result.rows[0] || null;
  });
}
