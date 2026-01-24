/**
 * Federation Inbox
 *
 * Handles inbound ActivityPub activities.
 * The actual inbox handlers are configured in federation.ts.
 */

// Re-export from the new modular processor
export { processActivity, type ProcessResult } from "./processor.ts";

// The inbox handlers are registered in federation.ts via:
// federation.setInboxListeners("/users/{identifier}/inbox", "/inbox")
//   .on(Create, async (ctx, create) => { await processActivity(ctx, db, DOMAIN, create, "inbound"); })
//   .on(Follow, ...)
//   .on(Accept, ...)
//   .on(Undo, ...)
//   .on(Delete, ...)
//   .on(Like, ...)
//   .on(Announce, ...);
