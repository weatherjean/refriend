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

    // Persist the accepted actor first
    const acceptedActor = await persistActor(db, domain, sender);
    if (!acceptedActor) {
      console.log(`[Accept] Failed to persist accepted actor`);
      return;
    }

    // Try to get the Follow activity from the Accept object
    let activity;
    try {
      activity = await accept.getObject();
    } catch (err) {
      // Common case: remote server includes Follow URI that we can't dereference
      // Fall back to accepting all pending follows to this actor
      console.log(`[Accept] Failed to get object (${err}), using fallback`);
      const count = await db.acceptPendingFollowsTo(acceptedActor.id);
      if (count > 0) {
        console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
      } else {
        console.log(`[Accept] No pending follows to ${acceptedActor.handle}`);
      }
      return;
    }

    if (!(activity instanceof Follow)) {
      // Not a Follow - try fallback
      console.log(`[Accept] Object is not a Follow activity, using fallback`);
      const count = await db.acceptPendingFollowsTo(acceptedActor.id);
      if (count > 0) {
        console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
      }
      return;
    }

    // Get our local follower from the Follow activity
    const followerId = activity.actorId;
    if (!followerId) {
      console.log(`[Accept] No follower ID in Follow activity, using fallback`);
      const count = await db.acceptPendingFollowsTo(acceptedActor.id);
      if (count > 0) {
        console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
      }
      return;
    }

    const followerActor = await db.getActorByUri(followerId.href);
    if (!followerActor) {
      console.log(`[Accept] Follower not found: ${followerId.href}, using fallback`);
      const count = await db.acceptPendingFollowsTo(acceptedActor.id);
      if (count > 0) {
        console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
      }
      return;
    }

    // Update the specific follow to accepted
    await db.addFollow(followerActor.id, acceptedActor.id, 'accepted');
    console.log(`[Accept] ${followerActor.handle} now following ${acceptedActor.handle}`);
  } catch (err) {
    console.error(`[Accept] Error processing Accept:`, err);
  }
}
