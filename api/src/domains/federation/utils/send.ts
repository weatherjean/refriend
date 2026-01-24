/**
 * Federation Send Utilities
 *
 * Functions for sending ActivityPub activities.
 */

import {
  Accept,
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Undo,
  type Context,
} from "@fedify/fedify";

type Activity = Create | Like | Follow | Delete | Undo | Accept | Announce;

/**
 * Serialize an activity to JSON for storage
 */
export async function serializeActivity(activity: Activity): Promise<string> {
  try {
    const json = await activity.toJsonLd();
    return JSON.stringify(json);
  } catch {
    // Fallback for localhost/dev environments where toJsonLd might fail
    return JSON.stringify({
      "@context": "https://www.w3.org/ns/activitystreams",
      type: activity.constructor.name,
      id: activity.id?.href,
      actor: activity.actorId?.href,
    });
  }
}

/**
 * Safe send activity - handles localhost/dev environments gracefully
 */
// deno-lint-ignore no-explicit-any
export async function safeSendActivity(
  ctx: Context<void>,
  sender: { identifier: string },
  recipients: any,
  activity: any
): Promise<void> {
  try {
    await ctx.sendActivity(sender, recipients, activity);
  } catch (e) {
    // In development (localhost), federation will fail - that's OK
    const errMsg = String(e);
    if (errMsg.includes("Localhost") || errMsg.includes("localhost")) {
      console.log(`[Federation] Skipped (localhost): ${activity.id?.href}`);
    } else {
      console.error(`[Federation] Failed to send activity:`, e);
    }
  }
}

/**
 * Get activity type name
 */
export function getActivityType(activity: Activity): string {
  if (activity instanceof Create) return "Create";
  if (activity instanceof Like) return "Like";
  if (activity instanceof Follow) return "Follow";
  if (activity instanceof Delete) return "Delete";
  if (activity instanceof Undo) return "Undo";
  if (activity instanceof Accept) return "Accept";
  if (activity instanceof Announce) return "Announce";
  return "Unknown";
}
