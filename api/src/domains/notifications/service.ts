/**
 * Notifications Service
 *
 * Business logic for notifications.
 */

import type { DB } from "../../db.ts";
import type { NotificationType, NotificationWithActor } from "../../shared/types.ts";
import * as repository from "./repository.ts";

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
  postId: number | null = null
): Promise<void> {
  return repository.createNotification(db, type, actorId, targetActorId, postId);
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
