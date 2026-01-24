import { Announce, Context, PUBLIC_COLLECTION } from "@fedify/fedify";
import type { Hono } from "@hono/hono";
import type { CommunityDB } from "./db.ts";
import { getDomain } from "../federation.ts";

let communityDb: CommunityDB;

export function setCommunityDB(commDb: CommunityDB) {
  communityDb = commDb;
}

/**
 * Add redirect routes for old /communities/:name URLs
 * The actual ActivityPub actor is now at /users/:name (handled by Fedify)
 */
export function addCommunityFederationRoutes(app: Hono) {
  // Redirect old /communities/:name to /users/:name for AP clients, or /c/:name for browsers
  app.get("/communities/:name", async (c) => {
    const name = c.req.param("name");
    const accept = c.req.header("Accept") || "";

    // For ActivityPub clients, redirect to the canonical /users/:name endpoint
    if (accept.includes("application/activity+json") ||
        accept.includes("application/ld+json")) {
      return c.redirect(`/users/${name}`, 301);
    }

    // For browsers, redirect to the web UI
    return c.redirect(`/c/${name}`);
  });
}

/**
 * Send an Announce activity for an approved community post
 */
export async function announcePost(
  ctx: Context<void>,
  communityName: string,
  postUri: string
): Promise<void> {
  const domain = getDomain();
  console.log(`[Community] Announcing post ${postUri} from community ${communityName}`);

  const community = await communityDb.getCommunityByName(communityName);
  if (!community) {
    console.error(`[Community] Community not found: ${communityName}`);
    return;
  }

  // Create the Announce activity
  const announceId = new URL(`https://${domain}/users/${communityName}#announces/${crypto.randomUUID()}`);
  const announce = new Announce({
    id: announceId,
    actor: ctx.getActorUri(communityName),
    object: new URL(postUri),
    to: PUBLIC_COLLECTION,
  });

  // Send to all followers of the community
  try {
    await ctx.sendActivity(
      { identifier: communityName },
      "followers",
      announce,
      { preferSharedInbox: true }
    );
    console.log(`[Community] Sent Announce to followers of ${communityName}`);
  } catch (e) {
    const errMsg = String(e);
    if (errMsg.includes("Localhost") || errMsg.includes("localhost")) {
      console.log(`[Community] Skipped Announce (localhost): ${announceId.href}`);
    } else {
      console.error(`[Community] Failed to send Announce:`, e);
    }
  }
}

/**
 * Get community actor URI (now uses /users/ path like regular users)
 */
export function getCommunityActorUri(communityName: string): URL {
  const domain = getDomain();
  return new URL(`https://${domain}/users/${communityName}`);
}
