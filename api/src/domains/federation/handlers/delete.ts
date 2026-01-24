/**
 * Delete Activity Handler
 *
 * Handles ActivityPub Delete activities.
 */

import { Delete, Tombstone, Note, isActor, type Context } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { safeSendActivity } from "../utils/send.ts";
import { invalidateProfileCache } from "../../../cache.ts";

/**
 * Process a Delete activity
 */
export async function processDelete(
  ctx: Context<void>,
  db: DB,
  domain: string,
  deleteActivity: Delete,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let actorRecord: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    actorRecord = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!actorRecord) {
    try {
      const actor = await deleteActivity.getActor();
      if (actor && isActor(actor)) {
        actorRecord = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!actorRecord) return;

  // Try to get the object being deleted
  let objectUri: string | undefined;
  try {
    const object = await deleteActivity.getObject();
    if (object instanceof Tombstone) {
      objectUri = object.id?.href;
    } else if (object instanceof Note) {
      objectUri = object.id?.href;
    }
  } catch {
    // In localhost dev, getObject might fail
  }

  if (!objectUri) return;

  // Find and delete the post
  const post = await db.getPostByUri(objectUri);
  if (post && post.actor_id === actorRecord.id) {
    await db.deletePost(post.id);
    console.log(`[Delete] Post ${post.id} by ${actorRecord.handle}`);

    // Invalidate the author's profile cache
    await invalidateProfileCache(actorRecord.id);

    // For outbound: send to followers
    if (direction === "outbound" && localUsername) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        "followers",
        deleteActivity
      );
      console.log(`[Delete] Sent to followers of ${localUsername}`);
    }
  }
}
