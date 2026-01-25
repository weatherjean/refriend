/**
 * Accept Activity Handler
 *
 * Handles ActivityPub Accept activities.
 */

import { Accept, Follow, isActor, type Context } from "@fedify/fedify";
import type { DB } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";

/**
 * Process an Accept activity
 */
export async function processAccept(
  _ctx: Context<void>,
  db: DB,
  domain: string,
  accept: Accept,
  _direction: "inbound" | "outbound"
): Promise<void> {
  try {
    // Get the accepted Follow activity
    let activity;
    try {
      activity = await accept.getObject();
    } catch (err) {
      console.log(`[Accept] Failed to get object: ${err}`);
      return;
    }
    if (!(activity instanceof Follow)) {
      console.log(`[Accept] Object is not a Follow activity`);
      return;
    }

    // Get the actor who sent the Accept (the one being followed)
    let sender;
    try {
      sender = await accept.getActor();
    } catch (err) {
      console.log(`[Accept] Failed to get actor: ${err}`);
      return;
    }
    if (!sender || !isActor(sender)) {
      console.log(`[Accept] Invalid sender actor`);
      return;
    }

    // Get our local follower from the Follow activity
    const followerId = activity.actorId;
    if (!followerId) {
      console.log(`[Accept] No follower ID in Follow activity`);
      return;
    }

    const followerActor = await db.getActorByUri(followerId.href);
    if (!followerActor) {
      console.log(`[Accept] Follower not found: ${followerId.href}`);
      return;
    }

    // Persist the accepted actor and add follow
    const acceptedActor = await persistActor(db, domain, sender);
    if (!acceptedActor) {
      console.log(`[Accept] Failed to persist accepted actor`);
      return;
    }

    await db.addFollow(followerActor.id, acceptedActor.id);
    console.log(`[Accept] ${followerActor.handle} now following ${acceptedActor.handle}`);
  } catch (err) {
    console.error(`[Accept] Error processing Accept:`, err);
  }
}
