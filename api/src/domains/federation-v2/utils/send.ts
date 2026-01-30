/**
 * Federation Send Utilities
 *
 * Functions for sending ActivityPub activities.
 */

import type { Context } from "@fedify/fedify";
import { signRequest } from "@fedify/fedify";

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

const AS_PUBLIC_FULL = "https://www.w3.org/ns/activitystreams#Public";

export interface SendToCommunityResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Send an activity directly to a Lemmy community inbox using manual signing.
 *
 * Fedify serializes PUBLIC_COLLECTION as "as:Public" in JSON-LD, but Lemmy
 * requires the full URI "https://www.w3.org/ns/activitystreams#Public".
 * This function serializes via toJsonLd(), patches the public collection URI,
 * signs with the actor's RSA key, and POSTs directly.
 *
 * Returns a result indicating success/failure so callers can handle errors
 * (e.g. rolling back a local post if the community rejects it).
 */
// deno-lint-ignore no-explicit-any
export async function sendToCommunity(
  ctx: Context<void>,
  username: string,
  activity: any,
  communityUri: string,
): Promise<SendToCommunityResult> {
  try {
    // Get the actor's RSA key pair (first key pair is RSA)
    const keyPairs = await ctx.getActorKeyPairs(username);
    if (!keyPairs || keyPairs.length === 0) {
      console.error(`[SendToCommunity] No key pairs for ${username}`);
      return { ok: false, error: "No key pairs available for signing" };
    }
    const rsaKeyPair = keyPairs[0];

    // Look up the community actor to find its inbox
    const communityActor = await ctx.lookupObject(new URL(communityUri));
    if (!communityActor) {
      console.error(`[SendToCommunity] Could not look up community: ${communityUri}`);
      return { ok: false, error: "Community not found" };
    }

    // deno-lint-ignore no-explicit-any
    const inboxUrl = (communityActor as any).inboxId?.href;
    if (!inboxUrl) {
      console.error(`[SendToCommunity] No inbox found for community: ${communityUri}`);
      return { ok: false, error: "Community has no inbox" };
    }

    // Serialize to JSON-LD and fix "as:Public" → full URI
    const jsonLd = await activity.toJsonLd({ contextLoader: ctx.contextLoader });
    const bodyString = JSON.stringify(jsonLd);
    const fixedBody = bodyString.replaceAll('"as:Public"', `"${AS_PUBLIC_FULL}"`);

    // Build and sign the request
    const request = new Request(inboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/activity+json",
        "Accept": "application/activity+json",
      },
      body: fixedBody,
    });

    const keyId = rsaKeyPair.keyId;
    const signed = await signRequest(request, rsaKeyPair.privateKey, keyId);

    const response = await fetch(signed);
    if (response.ok) {
      console.log(`[SendToCommunity] Sent to ${communityUri}: ${response.status}`);
      return { ok: true, status: response.status };
    } else {
      const text = await response.text();
      console.error(`[SendToCommunity] Failed (${response.status}): ${text.slice(0, 500)}`);
      return { ok: false, status: response.status, error: `Community rejected the post (${response.status})` };
    }
  } catch (e) {
    const errMsg = String(e);
    if (errMsg.includes("Localhost") || errMsg.includes("localhost")) {
      console.log(`[SendToCommunity] Skipped (localhost): ${communityUri}`);
      return { ok: true }; // Treat localhost skip as success for dev
    } else {
      console.error(`[SendToCommunity] Error sending to ${communityUri}:`, e);
      return { ok: false, error: `Failed to send to community: ${errMsg.slice(0, 200)}` };
    }
  }
}
