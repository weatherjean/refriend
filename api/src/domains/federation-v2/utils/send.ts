/**
 * Federation Send Utilities
 *
 * Functions for sending ActivityPub activities.
 */

import type { Context } from "@fedify/fedify";

/**
 * Options for sending activities
 */
export interface SendActivityOptions {
  /** Use shared inbox when available (reduces requests for multiple followers on same instance) */
  preferSharedInbox?: boolean;
}

/**
 * Safe send activity - handles localhost/dev environments gracefully
 */
// deno-lint-ignore no-explicit-any
export async function safeSendActivity(
  ctx: Context<void>,
  sender: { identifier: string },
  recipients: any,
  activity: any,
  options?: SendActivityOptions
): Promise<void> {
  try {
    await ctx.sendActivity(sender, recipients, activity, options);
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

