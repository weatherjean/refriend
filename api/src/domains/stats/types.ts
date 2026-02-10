/**
 * Stats Types
 *
 * Type definitions for public server statistics.
 */

export interface ServerStats {
  server: {
    total_users: number;
    active_30d: number;
    active_6mo: number;
    new_this_week: number;
    new_last_week: number;
    server_age_days: number;
  };
  content: {
    total_posts: number;
    posts_today: number;
    posts_this_week: number;
    posts_this_month: number;
    type_distribution: { note: number; page: number; article: number };
    media_percentage: number;
    hashtag_count: number;
  };
  engagement: {
    total_likes: number;
    total_boosts: number;
    total_replies: number;
    avg_likes_per_post: number;
    avg_boosts_per_post: number;
    avg_replies_per_post: number;
  };
  social: {
    total_follows: number;
    avg_followers_per_user: number;
    avg_following_per_user: number;
  };
  federation: {
    local_actors: number;
    remote_actors: number;
    total_actors: number;
  };
  growth: {
    users_this_week: number;
    users_last_week: number;
    posts_this_week: number;
    posts_last_week: number;
  };
  cached_at: string;
}
