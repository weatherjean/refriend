/**
 * Notifications Domain
 *
 * Re-exports all public interfaces from the notifications domain.
 */

export { createNotificationRoutes } from "./routes.ts";
export { createNotification, removeNotification } from "./service.ts";
export type { NotificationDTO } from "./service.ts";
