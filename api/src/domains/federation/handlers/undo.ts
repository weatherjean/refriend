/**
 * Undo Activity Handler
 *
 * Handles ActivityPub Undo activities (unlike, unfollow, unboost).
 */

import { Undo, Like, Follow, Announce, isActor, type Context } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { safeSendActivity } from "../utils/send.ts";
import { updatePostScore } from "../../../scoring.ts";
import { removeNotification } from "../../notifications/routes.ts";

/**
 * Process an Undo activity
 */
export async function processUndo(
  ctx: Context<void>,
  db: DB,
  domain: string,
  undo: Undo,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let activity: Like | Follow | Announce | null = null;
  let actorRecord: Actor | null = null;

  // Try to get the wrapped activity
  try {
    const obj = await undo.getObject();
    if (obj instanceof Like || obj instanceof Follow || obj instanceof Announce) {
      activity = obj;
    }
  } catch {
    // In localhost dev, getObject might fail
  }

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    actorRecord = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!actorRecord) {
    try {
      const actor = await undo.getActor();
      if (actor && isActor(actor)) {
        actorRecord = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!actorRecord) return;

  // Handle Undo(Follow)
  if (activity instanceof Follow) {
    const targetUri = activity.objectId?.href;
    if (!targetUri) return;

    const targetActor = await db.getActorByUri(targetUri);
    if (!targetActor) return;

    await db.removeFollow(actorRecord.id, targetActor.id);
    await removeNotification(db, 'follow', actorRecord.id, targetActor.id);
    console.log(`[Undo Follow] ${actorRecord.handle} unfollowed ${targetActor.handle}`);

    // For outbound to remote: send Undo activity
    if (direction === "outbound" && localUsername && !targetActor.user_id) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(targetActor.uri),
          inboxId: new URL(targetActor.inbox_url),
        },
        undo
      );
      console.log(`[Undo Follow] Sent to ${targetActor.handle}`);
    }
  }

  // Handle Undo(Like)
  if (activity instanceof Like) {
    const objectUri = activity.objectId?.href;
    if (!objectUri) return;

    const post = await db.getPostByUri(objectUri);
    if (!post) return;

    await db.removeLike(actorRecord.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'like', actorRecord.id, post.actor_id, post.id);
    console.log(`[Undo Like] ${actorRecord.handle} unliked post ${post.id}`);

    // For outbound to remote: send Undo activity
    if (direction === "outbound" && localUsername) {
      const postAuthor = await db.getActorById(post.actor_id);
      if (postAuthor && !postAuthor.user_id) {
        await safeSendActivity(ctx,
          { identifier: localUsername },
          {
            id: new URL(postAuthor.uri),
            inboxId: new URL(postAuthor.inbox_url),
          },
          undo
        );
        console.log(`[Undo Like] Sent to ${postAuthor.handle}`);
      }
    }
  }

  // Handle Undo(Announce)
  if (activity instanceof Announce) {
    const objectUri = activity.objectId?.href;
    if (!objectUri) return;

    const post = await db.getPostByUri(objectUri);
    if (!post) return;

    await db.removeBoost(actorRecord.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'boost', actorRecord.id, post.actor_id, post.id);
    console.log(`[Undo Announce] ${actorRecord.handle} unboosted post ${post.id}`);

    // For outbound: send to followers and post author
    if (direction === "outbound" && localUsername) {
      // Send to followers (use shared inbox for efficiency)
      await safeSendActivity(ctx,
        { identifier: localUsername },
        "followers",
        undo,
        { preferSharedInbox: true }
      );
      console.log(`[Undo Announce] Sent to followers of ${localUsername}`);

      // Also notify post author if remote
      const postAuthor = await db.getActorById(post.actor_id);
      if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
        await safeSendActivity(ctx,
          { identifier: localUsername },
          {
            id: new URL(postAuthor.uri),
            inboxId: new URL(postAuthor.inbox_url),
          },
          undo
        );
        console.log(`[Undo Announce] Sent to ${postAuthor.handle}`);
      }
    }
  }
}
