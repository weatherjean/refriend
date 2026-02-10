/**
 * Notifications Repository
 *
 * Database operations for notifications.
 */

import type { DB } from "../../db.ts";
import type { NotificationType, NotificationWithActor } from "../../shared/types.ts";

export interface NotificationPreferences {
  likes: boolean;
  replies: boolean;
  mentions: boolean;
  boosts: boolean;
  follows: boolean;
}

/**
 * Create a notification
 * Does not notify if actor is targeting themselves
 */
export async function createNotification(
  db: DB,
  type: NotificationType,
  actorId: number,
  targetActorId: number,
  postId: number | null = null,
  feedId: number | null = null
): Promise<void> {
  // Don't notify yourself
  if (actorId === targetActorId) return;

  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO notifications (type, actor_id, target_actor_id, post_id, feed_id)
      VALUES (${type}, ${actorId}, ${targetActorId}, ${postId}, ${feedId})
    `;
  });
}

/**
 * Remove a notification (for undo actions like unlike/unboost/unfollow)
 */
export async function removeNotification(
  db: DB,
  type: NotificationType,
  actorId: number,
  targetActorId: number,
  postId: number | null = null
): Promise<void> {
  await db.query(async (client) => {
    if (postId !== null) {
      await client.queryArray`
        DELETE FROM notifications
        WHERE type = ${type}
          AND actor_id = ${actorId}
          AND target_actor_id = ${targetActorId}
          AND post_id = ${postId}
      `;
    } else {
      await client.queryArray`
        DELETE FROM notifications
        WHERE type = ${type}
          AND actor_id = ${actorId}
          AND target_actor_id = ${targetActorId}
          AND post_id IS NULL
      `;
    }
  });
}

/**
 * Get notifications for an actor with cursor-based pagination.
 * Uses `before` cursor (notification ID) for efficient pagination.
 * @param db Database instance
 * @param targetActorId The actor receiving notifications
 * @param limit Maximum notifications to return
 * @param before Optional cursor - return notifications with ID less than this value
 */
export async function getNotifications(
  db: DB,
  targetActorId: number,
  limit: number = 50,
  before?: number
): Promise<NotificationWithActor[]> {
  return await db.query(async (client) => {
    // Use cursor-based pagination for O(1) offset regardless of position
    const query = before
      ? `SELECT
          n.id, n.type, n.actor_id, n.target_actor_id, n.post_id, n.feed_id, n.read, n.created_at,
          a.public_id as actor_public_id, a.handle as actor_handle,
          a.name as actor_name, a.avatar_url as actor_avatar_url,
          p.public_id as post_public_id, p.content as post_content,
          pa.handle as post_author_handle, pa.user_id as post_author_user_id,
          f.slug as feed_slug, f.name as feed_name
        FROM notifications n
        JOIN actors a ON a.id = n.actor_id
        LEFT JOIN posts p ON p.id = n.post_id
        LEFT JOIN actors pa ON pa.id = p.actor_id
        LEFT JOIN feeds f ON f.id = n.feed_id
        WHERE n.target_actor_id = $1 AND n.id < $2
        ORDER BY n.id DESC
        LIMIT $3`
      : `SELECT
          n.id, n.type, n.actor_id, n.target_actor_id, n.post_id, n.feed_id, n.read, n.created_at,
          a.public_id as actor_public_id, a.handle as actor_handle,
          a.name as actor_name, a.avatar_url as actor_avatar_url,
          p.public_id as post_public_id, p.content as post_content,
          pa.handle as post_author_handle, pa.user_id as post_author_user_id,
          f.slug as feed_slug, f.name as feed_name
        FROM notifications n
        JOIN actors a ON a.id = n.actor_id
        LEFT JOIN posts p ON p.id = n.post_id
        LEFT JOIN actors pa ON pa.id = p.actor_id
        LEFT JOIN feeds f ON f.id = n.feed_id
        WHERE n.target_actor_id = $1
        ORDER BY n.id DESC
        LIMIT $2`;

    const params = before ? [targetActorId, before, limit] : [targetActorId, limit];
    const result = await client.queryObject<{
      id: number;
      type: NotificationType;
      actor_id: number;
      target_actor_id: number;
      post_id: number | null;
      feed_id: number | null;
      read: boolean;
      created_at: Date;
      actor_public_id: string;
      actor_handle: string;
      actor_name: string | null;
      actor_avatar_url: string | null;
      post_public_id: string | null;
      post_content: string | null;
      post_author_handle: string | null;
      post_author_user_id: number | null;
      feed_slug: string | null;
      feed_name: string | null;
    }>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      actor_id: row.actor_id,
      target_actor_id: row.target_actor_id,
      post_id: row.post_id,
      feed_id: row.feed_id,
      read: row.read,
      created_at: row.created_at,
      actor: {
        id: row.actor_id,
        public_id: row.actor_public_id,
        handle: row.actor_handle,
        name: row.actor_name,
        avatar_url: row.actor_avatar_url,
      },
      post: row.post_id ? {
        id: row.post_id,
        public_id: row.post_public_id!,
        content: row.post_content!,
        author_handle: row.post_author_handle!,
        author_is_local: row.post_author_user_id != null,
      } : undefined,
      feed: row.feed_id ? {
        id: row.feed_id,
        slug: row.feed_slug!,
        name: row.feed_name!,
      } : undefined,
    }));
  });
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(db: DB, targetActorId: number): Promise<number> {
  return await db.query(async (client) => {
    const result = await client.queryObject<{ count: bigint }>`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE target_actor_id = ${targetActorId} AND read = FALSE
    `;
    return Number(result.rows[0]?.count ?? 0);
  });
}

/**
 * Mark notifications as read
 */
export async function markAsRead(
  db: DB,
  targetActorId: number,
  notificationIds?: number[]
): Promise<void> {
  await db.query(async (client) => {
    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      await client.queryArray`
        UPDATE notifications
        SET read = TRUE
        WHERE target_actor_id = ${targetActorId}
          AND id = ANY(${notificationIds})
      `;
    } else {
      // Mark all as read
      await client.queryArray`
        UPDATE notifications
        SET read = TRUE
        WHERE target_actor_id = ${targetActorId} AND read = FALSE
      `;
    }
  });
}

/**
 * Delete notifications
 */
export async function deleteNotifications(
  db: DB,
  targetActorId: number,
  notificationIds?: number[]
): Promise<void> {
  await db.query(async (client) => {
    if (notificationIds && notificationIds.length > 0) {
      // Delete specific notifications
      await client.queryArray`
        DELETE FROM notifications
        WHERE target_actor_id = ${targetActorId}
          AND id = ANY(${notificationIds})
      `;
    } else {
      // Delete all notifications for this user
      await client.queryArray`
        DELETE FROM notifications
        WHERE target_actor_id = ${targetActorId}
      `;
    }
  });
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  likes: true,
  replies: true,
  mentions: true,
  boosts: true,
  follows: true,
};

/**
 * Get notification preferences for an actor (defaults to all-true if no row exists)
 */
export async function getNotificationPreferences(
  db: DB,
  actorId: number
): Promise<NotificationPreferences> {
  return await db.query(async (client) => {
    const result = await client.queryObject<NotificationPreferences>`
      SELECT likes, replies, mentions, boosts, follows
      FROM notification_preferences
      WHERE actor_id = ${actorId}
    `;
    return result.rows[0] ?? { ...DEFAULT_PREFERENCES };
  });
}

/**
 * Upsert notification preferences for an actor
 */
export async function updateNotificationPreferences(
  db: DB,
  actorId: number,
  prefs: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  return await db.query(async (client) => {
    const result = await client.queryObject<NotificationPreferences>`
      INSERT INTO notification_preferences (actor_id, likes, replies, mentions, boosts, follows)
      VALUES (
        ${actorId},
        ${prefs.likes ?? true},
        ${prefs.replies ?? true},
        ${prefs.mentions ?? true},
        ${prefs.boosts ?? true},
        ${prefs.follows ?? true}
      )
      ON CONFLICT (actor_id) DO UPDATE SET
        likes = COALESCE(${prefs.likes ?? null}, notification_preferences.likes),
        replies = COALESCE(${prefs.replies ?? null}, notification_preferences.replies),
        mentions = COALESCE(${prefs.mentions ?? null}, notification_preferences.mentions),
        boosts = COALESCE(${prefs.boosts ?? null}, notification_preferences.boosts),
        follows = COALESCE(${prefs.follows ?? null}, notification_preferences.follows)
      RETURNING likes, replies, mentions, boosts, follows
    `;
    return result.rows[0];
  });
}
