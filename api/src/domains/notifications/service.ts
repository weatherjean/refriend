/**
 * Notifications Service
 *
 * Business logic for notifications.
 */

import type { DB } from "../../db.ts";
import type { NotificationType, NotificationWithActor } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import type { NotificationPreferences } from "./repository.ts";
import { sendPushNotification } from "../push/service.ts";
import { logger } from "../../logger.ts";

/** Map notification types to preference column names */
const TYPE_TO_PREF: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  like: 'likes',
  reply: 'replies',
  mention: 'mentions',
  boost: 'boosts',
  follow: 'follows',
};

export interface NotificationDTO {
  id: number;
  type: NotificationType;
  read: boolean;
  created_at: string;
  actor: {
    id: string;
    handle: string;
    name: string | null;
    avatar_url: string | null;
  };
  post: {
    id: string;
    content: string;
    author: {
      handle: string;
      is_local: boolean;
    };
  } | null;
  feed: {
    slug: string;
    name: string;
  } | null;
}

/**
 * Format a date for API response
 */
function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Convert notification to DTO format
 */
function toDTO(n: NotificationWithActor): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    read: n.read,
    created_at: formatDate(n.created_at),
    actor: {
      id: n.actor.public_id,
      handle: n.actor.handle,
      name: n.actor.name,
      avatar_url: n.actor.avatar_url,
    },
    post: n.post ? {
      id: n.post.public_id,
      content: n.post.content.slice(0, 100), // Preview only
      author: {
        handle: n.post.author_handle,
        is_local: n.post.author_is_local,
      },
    } : null,
    feed: n.feed ? {
      slug: n.feed.slug,
      name: n.feed.name,
    } : null,
  };
}

/**
 * Get notifications for an actor with cursor-based pagination.
 * @param db Database instance
 * @param actorId The actor receiving notifications
 * @param limit Maximum notifications to return
 * @param before Optional cursor - return notifications with ID less than this value
 * @returns Object with notifications array and next_cursor for pagination
 */
export async function getNotifications(
  db: DB,
  actorId: number,
  limit: number = 50,
  before?: number
): Promise<{ notifications: NotificationDTO[]; next_cursor: number | null }> {
  const notifications = await repository.getNotifications(db, actorId, limit, before);
  const dtos = notifications.map(toDTO);

  // Calculate next cursor: if we got a full page, use the last item's ID
  const next_cursor = notifications.length === limit
    ? notifications[notifications.length - 1].id
    : null;

  return { notifications: dtos, next_cursor };
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(db: DB, actorId: number): Promise<number> {
  return repository.getUnreadCount(db, actorId);
}

/**
 * Mark notifications as read
 */
export async function markAsRead(
  db: DB,
  actorId: number,
  notificationIds?: number[]
): Promise<void> {
  return repository.markAsRead(db, actorId, notificationIds);
}

/**
 * Delete notifications
 */
export async function deleteNotifications(
  db: DB,
  actorId: number,
  notificationIds?: number[]
): Promise<void> {
  return repository.deleteNotifications(db, actorId, notificationIds);
}

/**
 * Create a notification (used by other services)
 */
export async function createNotification(
  db: DB,
  type: NotificationType,
  actorId: number,
  targetActorId: number,
  postId: number | null = null,
  feedId: number | null = null
): Promise<void> {
  // Don't notify yourself (repository also checks, but skip push work too)
  if (actorId === targetActorId) return;

  // Check if the target actor has this notification type enabled
  const prefKey = TYPE_TO_PREF[type];
  if (prefKey) {
    const prefs = await repository.getNotificationPreferences(db, targetActorId);
    if (!prefs[prefKey]) return;
  }

  await repository.createNotification(db, type, actorId, targetActorId, postId, feedId);

  // Fire-and-forget push notification
  triggerPush(db, type, actorId, targetActorId, postId, feedId).catch((err) => {
    logger.error("[Push] Error triggering push notification:", err);
  });
}

/**
 * Look up actor/post/feed details and send a push notification.
 * Uses a single JOIN query instead of multiple sequential roundtrips.
 */
async function triggerPush(
  db: DB,
  type: NotificationType,
  actorId: number,
  targetActorId: number,
  postId: number | null,
  feedId: number | null,
): Promise<void> {
  const row = await db.query(async (client) => {
    const r = await client.queryObject<{
      actor_name: string | null;
      actor_handle: string;
      post_public_id: string | null;
      post_content: string | null;
      post_author_handle: string | null;
      feed_slug: string | null;
    }>`
      SELECT
        a.name       AS actor_name,
        a.handle     AS actor_handle,
        p.public_id  AS post_public_id,
        p.content    AS post_content,
        pa.handle    AS post_author_handle,
        f.slug       AS feed_slug
      FROM actors a
      LEFT JOIN posts p  ON p.id  = ${postId}
      LEFT JOIN actors pa ON pa.id = p.actor_id
      LEFT JOIN feeds f  ON f.id  = ${feedId}
      WHERE a.id = ${actorId}
    `;
    return r.rows[0] ?? null;
  });

  if (!row) return;

  const postContentPreview = row.post_content
    ?.replace(/<[^>]*>/g, "").slice(0, 100);

  await sendPushNotification(
    db,
    targetActorId,
    type,
    row.actor_name || row.actor_handle,
    row.actor_handle.split("@")[0],
    row.post_author_handle?.split("@")[0],
    row.post_public_id ?? undefined,
    postContentPreview,
    row.feed_slug ?? undefined,
  );
}

/**
 * Remove a notification (used by other services for undo actions)
 */
export async function removeNotification(
  db: DB,
  type: NotificationType,
  actorId: number,
  targetActorId: number,
  postId: number | null = null
): Promise<void> {
  return repository.removeNotification(db, type, actorId, targetActorId, postId);
}

/**
 * Get notification preferences for an actor
 */
export async function getNotificationPreferences(
  db: DB,
  actorId: number
): Promise<NotificationPreferences> {
  return repository.getNotificationPreferences(db, actorId);
}

/**
 * Update notification preferences for an actor
 */
export async function updateNotificationPreferences(
  db: DB,
  actorId: number,
  prefs: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  return repository.updateNotificationPreferences(db, actorId, prefs);
}
