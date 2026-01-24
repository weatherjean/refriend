/**
 * Announce Activity Handler
 *
 * Handles ActivityPub Announce activities (boosts/reblogs).
 */

import { Announce, isActor, type Context } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { safeSendActivity } from "../utils/send.ts";
import { fetchAndStoreNote } from "../utils/notes.ts";
import { updatePostScore } from "../../../scoring.ts";
import { createNotification } from "../../notifications/routes.ts";

/**
 * Process an Announce activity
 */
export async function processAnnounce(
  ctx: Context<void>,
  db: DB,
  domain: string,
  announce: Announce,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let boosterActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    boosterActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!boosterActor) {
    try {
      const actor = await announce.getActor();
      if (actor && isActor(actor)) {
        boosterActor = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!boosterActor) return;

  const objectUri = announce.objectId?.href;
  if (!objectUri) return;

  // Try to find the post locally, or fetch it if remote
  let post = await db.getPostByUri(objectUri);
  if (!post) {
    // Try to fetch the remote post
    const postId = await fetchAndStoreNote(ctx, db, domain, objectUri);
    if (postId) {
      post = await db.getPostById(postId);
    }
  }

  if (!post) {
    console.log(`[Announce] Post not found: ${objectUri}`);
    return;
  }

  // Add the boost and update hot score
  await db.addBoost(boosterActor.id, post.id);
  await updatePostScore(db, post.id);
  await createNotification(db, 'boost', boosterActor.id, post.actor_id, post.id);
  console.log(`[Announce] ${boosterActor.handle} boosted post ${post.id}`);

  // For outbound: send to followers and post author
  if (direction === "outbound" && localUsername) {
    // Send to followers
    await safeSendActivity(ctx,
      { identifier: localUsername },
      "followers",
      announce
    );
    console.log(`[Announce] Sent to followers of ${localUsername}`);

    // Also send to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        announce
      );
      console.log(`[Announce] Sent to ${postAuthor.handle}`);
    }
  }
}
