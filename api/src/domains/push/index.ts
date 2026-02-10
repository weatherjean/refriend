/**
 * Push Notifications Domain
 *
 * Re-exports all public interfaces from the push domain.
 */

export { createPushRoutes } from "./routes.ts";
export { initVapid, sendPushNotification } from "./service.ts";
