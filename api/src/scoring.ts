/**
 * Hot score calculation module
 *
 * Formula: (likes + boosts*2 + replies*3) / (age_hours + 2)^1.5
 *
 * - Boosts worth 2x (spreads content to new audiences)
 * - Replies worth 3x (highest engagement signal)
 * - Time decay prevents old viral posts from dominating forever
 * - +2 hours prevents division issues and smooths early scoring
 */

import type { DB } from "./db.ts";

const BOOST_WEIGHT = 2;
const REPLY_WEIGHT = 3;
const TIME_DECAY_POWER = 1.5;
const TIME_OFFSET_HOURS = 2;

/**
 * Calculate hot score for a post
 */
function calculateHotScore(
  likes: number,
  boosts: number,
  replies: number,
  ageHours: number
): number {
  const engagement = likes + (boosts * BOOST_WEIGHT) + (replies * REPLY_WEIGHT);
  const timeFactor = Math.pow(ageHours + TIME_OFFSET_HOURS, TIME_DECAY_POWER);
  return engagement / timeFactor;
}

/**
 * Update a post's hot score based on current engagement metrics
 * Uses denormalized columns for O(1) reads instead of COUNT subqueries
 */
export async function updatePostScore(db: DB, postId: number): Promise<void> {
  await db.query(async (client) => {
    const result = await client.queryObject<{
      likes_count: number;
      boosts_count: number;
      replies_count: number;
      age_hours: number;
    }>`
      SELECT
        likes_count,
        boosts_count,
        replies_count,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as age_hours
      FROM posts
      WHERE id = ${postId}
    `;

    if (result.rows.length === 0) return;

    const row = result.rows[0];
    const hotScore = calculateHotScore(
      row.likes_count,
      row.boosts_count,
      row.replies_count,
      row.age_hours
    );

    await client.queryArray`
      UPDATE posts SET hot_score = ${hotScore} WHERE id = ${postId}
    `;
  });
}

/**
 * Update hot score for a parent post when a reply is added/removed
 */
export async function updateParentPostScore(db: DB, parentPostId: number | null): Promise<void> {
  if (parentPostId === null) return;
  await updatePostScore(db, parentPostId);
}
