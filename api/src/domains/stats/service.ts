/**
 * Stats Service
 *
 * Aggregates public server statistics with in-memory caching.
 */

import type { DB } from "../../db.ts";
import type { ServerStats } from "./types.ts";

let statsCache: { stats: ServerStats; cachedAt: number } | null = null;
let statsPending: Promise<ServerStats> | null = null;
const STATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getStats(db: DB): Promise<ServerStats> {
  const now = Date.now();

  if (statsCache && (now - statsCache.cachedAt) < STATS_CACHE_TTL) {
    return statsCache.stats;
  }

  // Deduplicate concurrent requests — share one in-flight query
  if (statsPending) return statsPending;
  statsPending = fetchStats(db).finally(() => { statsPending = null; });
  return statsPending;
}

async function fetchStats(db: DB): Promise<ServerStats> {
  const now = Date.now();
  const cachedAt = new Date().toISOString();

  // deno-lint-ignore no-explicit-any
  const stats = await db.query(async (client): Promise<ServerStats> => {
    const result = await client.queryObject<Record<string, any>>`
      WITH server_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE NOT suspended) AS total_users,
          COUNT(*) FILTER (WHERE NOT suspended AND last_active_at > NOW() - INTERVAL '30 days') AS active_30d,
          COUNT(*) FILTER (WHERE NOT suspended AND last_active_at > NOW() - INTERVAL '6 months') AS active_6mo,
          COUNT(*) FILTER (WHERE NOT suspended AND created_at > date_trunc('week', NOW())) AS new_this_week,
          COUNT(*) FILTER (WHERE NOT suspended AND created_at > date_trunc('week', NOW()) - INTERVAL '7 days'
                           AND created_at <= date_trunc('week', NOW())) AS new_last_week,
          EXTRACT(DAY FROM NOW() - MIN(created_at))::integer AS server_age_days
        FROM users
      ),
      content_stats AS (
        SELECT
          COUNT(*) AS total_posts,
          COUNT(*) FILTER (WHERE p.created_at > date_trunc('day', NOW())) AS posts_today,
          COUNT(*) FILTER (WHERE p.created_at > date_trunc('week', NOW())) AS posts_this_week,
          COUNT(*) FILTER (WHERE p.created_at > date_trunc('month', NOW())) AS posts_this_month,
          COUNT(*) FILTER (WHERE p.created_at > date_trunc('week', NOW()) - INTERVAL '7 days'
                           AND p.created_at <= date_trunc('week', NOW())) AS posts_last_week,
          COUNT(*) FILTER (WHERE p.type = 'Note') AS type_note,
          COUNT(*) FILTER (WHERE p.type = 'Page') AS type_page,
          COUNT(*) FILTER (WHERE p.type = 'Article') AS type_article
        FROM posts p
        JOIN actors a ON p.actor_id = a.id
        WHERE a.user_id IS NOT NULL
      ),
      media_stats AS (
        SELECT COUNT(DISTINCT m.post_id) AS posts_with_media
        FROM media m
        JOIN posts p ON m.post_id = p.id
        JOIN actors a ON p.actor_id = a.id
        WHERE a.user_id IS NOT NULL
      ),
      hashtag_stats AS (
        SELECT COUNT(*) AS hashtag_count FROM hashtags
      ),
      engagement_stats AS (
        SELECT
          (SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id = p.id JOIN actors a ON p.actor_id = a.id WHERE a.user_id IS NOT NULL) AS total_likes,
          (SELECT COUNT(*) FROM boosts b JOIN posts p ON b.post_id = p.id JOIN actors a ON p.actor_id = a.id WHERE a.user_id IS NOT NULL) AS total_boosts,
          (SELECT COUNT(*) FROM posts p JOIN posts parent ON p.in_reply_to_id = parent.id JOIN actors a ON parent.actor_id = a.id WHERE a.user_id IS NOT NULL) AS total_replies
      ),
      social_stats AS (
        SELECT
          COUNT(*) AS total_follows,
          COUNT(*) FILTER (WHERE fa.user_id IS NOT NULL) AS total_followers_received,
          COUNT(*) FILTER (WHERE fb.user_id IS NOT NULL) AS total_following_sent
        FROM follows f
        JOIN actors fa ON f.following_id = fa.id
        JOIN actors fb ON f.follower_id = fb.id
        WHERE f.status = 'accepted'
      ),
      federation_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS local_actors,
          COUNT(*) FILTER (WHERE user_id IS NULL) AS remote_actors,
          COUNT(*) AS total_actors
        FROM actors
      ),
      local_actor_count AS (
        SELECT COUNT(*) AS cnt FROM actors WHERE user_id IS NOT NULL
      )
      SELECT
        s.total_users, s.active_30d, s.active_6mo, s.new_this_week, s.new_last_week,
        COALESCE(s.server_age_days, 0) AS server_age_days,
        c.total_posts, c.posts_today, c.posts_this_week, c.posts_this_month, c.posts_last_week,
        c.type_note, c.type_page, c.type_article,
        ms.posts_with_media,
        h.hashtag_count,
        e.total_likes, e.total_boosts, e.total_replies,
        so.total_follows, so.total_followers_received, so.total_following_sent,
        f.local_actors, f.remote_actors, f.total_actors,
        la.cnt AS local_actor_cnt
      FROM server_stats s, content_stats c, media_stats ms, hashtag_stats h,
           engagement_stats e, social_stats so, federation_stats f, local_actor_count la
    `;

    const row = result.rows[0];
    const totalPosts = Number(row.total_posts) || 0;
    const localActorCnt = Number(row.local_actor_cnt) || 1; // avoid division by zero

    return {
      server: {
        total_users: Number(row.total_users),
        active_30d: Number(row.active_30d),
        active_6mo: Number(row.active_6mo),
        new_this_week: Number(row.new_this_week),
        new_last_week: Number(row.new_last_week),
        server_age_days: Number(row.server_age_days),
      },
      content: {
        total_posts: totalPosts,
        posts_today: Number(row.posts_today),
        posts_this_week: Number(row.posts_this_week),
        posts_this_month: Number(row.posts_this_month),
        type_distribution: {
          note: Number(row.type_note),
          page: Number(row.type_page),
          article: Number(row.type_article),
        },
        media_percentage: totalPosts > 0
          ? Math.round((Number(row.posts_with_media) / totalPosts) * 100 * 10) / 10
          : 0,
        hashtag_count: Number(row.hashtag_count),
      },
      engagement: {
        total_likes: Number(row.total_likes),
        total_boosts: Number(row.total_boosts),
        total_replies: Number(row.total_replies),
        avg_likes_per_post: totalPosts > 0
          ? Math.round((Number(row.total_likes) / totalPosts) * 100) / 100
          : 0,
        avg_boosts_per_post: totalPosts > 0
          ? Math.round((Number(row.total_boosts) / totalPosts) * 100) / 100
          : 0,
        avg_replies_per_post: totalPosts > 0
          ? Math.round((Number(row.total_replies) / totalPosts) * 100) / 100
          : 0,
      },
      social: {
        total_follows: Number(row.total_follows),
        avg_followers_per_user: localActorCnt > 0
          ? Math.round((Number(row.total_followers_received) / localActorCnt) * 100) / 100
          : 0,
        avg_following_per_user: localActorCnt > 0
          ? Math.round((Number(row.total_following_sent) / localActorCnt) * 100) / 100
          : 0,
      },
      federation: {
        local_actors: Number(row.local_actors),
        remote_actors: Number(row.remote_actors),
        total_actors: Number(row.total_actors),
      },
      growth: {
        users_this_week: Number(row.new_this_week),
        users_last_week: Number(row.new_last_week),
        posts_this_week: Number(row.posts_this_week),
        posts_last_week: Number(row.posts_last_week),
      },
      cached_at: cachedAt,
    };
  });

  statsCache = { stats, cachedAt: now };
  return stats;
}
