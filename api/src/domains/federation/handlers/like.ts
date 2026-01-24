/**
 * Like Activity Handler
 *
 * Handles ActivityPub Like activities.
 */

import { Like, isActor, type Context } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { safeSendActivity } from "../utils/send.ts";
import { updatePostScore } from "../../../scoring.ts";
import { createNotification } from "../../notifications/routes.ts";

/**
 * Process a Like activity
 */
export async function processLike(
  ctx: Context<void>,
  db: DB,
  domain: string,
  like: Like,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let likerActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    likerActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!likerActor) {
    try {
      const actor = await like.getActor();
      if (actor && isActor(actor)) {
        likerActor = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!likerActor) return;

  const objectUri = like.objectId?.href;
  if (!objectUri) return;

  const post = await db.getPostByUri(objectUri);
  if (!post) {
    console.log(`[Like] Post not found: ${objectUri}`);
    return;
  }

  // Add the like and update hot score
  await db.addLike(likerActor.id, post.id);
  await updatePostScore(db, post.id);
  await createNotification(db, 'like', likerActor.id, post.actor_id, post.id);
  console.log(`[Like] ${likerActor.handle} liked post ${post.id}`);

  // For outbound: send to post author if remote
  if (direction === "outbound" && localUsername) {
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        like
      );
      console.log(`[Like] Sent to ${postAuthor.handle}`);
    }
  }
}
