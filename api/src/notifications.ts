/**
 * Notifications module
 *
 * Handles creating and querying notifications for user interactions.
 * Notification types: like, boost, follow, reply, mention
 */

import type { DB } from "./db.ts";

export type NotificationType = 'like' | 'boost' | 'follow' | 'reply' | 'mention';

export interface Notification {
  id: number;
  type: NotificationType;
  actor_id: number;
  target_actor_id: number;
  post_id: number | null;
  read: boolean;
  created_at: Date;
}

export interface NotificationWithActor extends Notification {
  actor: {
    id: number;
    public_id: string;
    handle: string;
    name: string | null;
    avatar_url: string | null;
  };
  post?: {
    id: number;
    public_id: string;
    content: string;
  };
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
  postId: number | null = null
): Promise<void> {
  // Don't notify yourself
  if (actorId === targetActorId) return;

  await db.query(async (client) => {
    await client.queryArray`
      INSERT INTO notifications (type, actor_id, target_actor_id, post_id)
      VALUES (${type}, ${actorId}, ${targetActorId}, ${postId})
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
 * Get notifications for an actor with pagination
 */
export async function getNotifications(
  db: DB,
  targetActorId: number,
  limit: number = 50,
  offset: number = 0
): Promise<NotificationWithActor[]> {
  return await db.query(async (client) => {
    const result = await client.queryObject<{
      id: number;
      type: NotificationType;
      actor_id: number;
      target_actor_id: number;
      post_id: number | null;
      read: boolean;
      created_at: Date;
      actor_public_id: string;
      actor_handle: string;
      actor_name: string | null;
      actor_avatar_url: string | null;
      post_public_id: string | null;
      post_content: string | null;
    }>`
      SELECT
        n.id, n.type, n.actor_id, n.target_actor_id, n.post_id, n.read, n.created_at,
        a.public_id as actor_public_id, a.handle as actor_handle,
        a.name as actor_name, a.avatar_url as actor_avatar_url,
        p.public_id as post_public_id, p.content as post_content
      FROM notifications n
      JOIN actors a ON a.id = n.actor_id
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.target_actor_id = ${targetActorId}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      actor_id: row.actor_id,
      target_actor_id: row.target_actor_id,
      post_id: row.post_id,
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
