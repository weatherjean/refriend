/**
 * Federation Outbox
 *
 * Handles outbound ActivityPub activities.
 */

// Re-export processActivity for outbound handling
export { processActivity } from "../../activities.ts";

// Outbound activities are created in the route handlers and processed via:
// processActivity(ctx, db, domain, activity, "outbound", username)
//
// Example from social routes:
// const likeActivity = new Like({...});
// await processActivity(ctx, db, domain, likeActivity, "outbound", user.username);
