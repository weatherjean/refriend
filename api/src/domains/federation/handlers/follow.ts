/**
 * Follow Activity Handler
 *
 * Handles ActivityPub Follow activities.
 */

import { Accept, Follow, isActor, type Actor as APActor, type Context } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { safeSendActivity } from "../utils/send.ts";
import { createNotification } from "../../notifications/routes.ts";

/**
 * Process a Follow activity
 */
export async function processFollow(
  ctx: Context<void>,
  db: DB,
  domain: string,
  follow: Follow,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let followerActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    followerActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  let followerAP: APActor | null = null;
  if (!followerActor) {
    try {
      followerAP = await follow.getActor() as APActor | null;
      if (followerAP && isActor(followerAP)) {
        followerActor = await persistActor(db, domain, followerAP);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!followerActor) return;

  const targetUri = follow.objectId?.href;
  if (!targetUri) return;

  // Find target actor
  const targetActor = await db.getActorByUri(targetUri);
  if (!targetActor) {
    console.log(`[Follow] Target not found: ${targetUri}`);
    return;
  }

  // Determine if target is local
  const isLocalTarget = targetActor.user_id || targetActor.actor_type === 'Group';
  const isOutboundToRemote = direction === "outbound" && !isLocalTarget;

  // Add the follow relationship:
  // - Inbound follows / local-to-local: status = 'accepted'
  // - Outbound to remote: status = 'pending' (wait for Accept)
  if (isOutboundToRemote) {
    await db.addFollow(followerActor.id, targetActor.id, 'pending');
    console.log(`[Follow] ${followerActor.handle} -> ${targetActor.handle} (pending)`);
  } else {
    await db.addFollow(followerActor.id, targetActor.id, 'accepted');
    await createNotification(db, 'follow', followerActor.id, targetActor.id);
    console.log(`[Follow] ${followerActor.handle} -> ${targetActor.handle}`);
  }

  // For inbound: if target is local (user or community), send Accept
  if (direction === "inbound" && isLocalTarget && followerActor.inbox_url) {
    const username = targetActor.handle.match(/@([^@]+)@/)?.[1];
    if (username) {
      const accept = new Accept({
        id: new URL(`https://${domain}/#accepts/${crypto.randomUUID()}`),
        actor: ctx.getActorUri(username),
        object: follow,
      });

      // Use followerAP if available, otherwise use the persisted followerActor
      const recipient = followerAP ?? {
        id: new URL(followerActor.uri),
        inboxId: new URL(followerActor.inbox_url),
      };

      await safeSendActivity(ctx,
        { identifier: username },
        recipient,
        accept
      );
      console.log(`[Follow] Sent Accept to ${followerActor.handle}`);
    }
  }

  // For outbound to remote: send Follow activity
  if (direction === "outbound" && localUsername && !targetActor.user_id) {
    await safeSendActivity(ctx,
      { identifier: localUsername },
      {
        id: new URL(targetActor.uri),
        inboxId: new URL(targetActor.inbox_url),
      },
      follow
    );
    console.log(`[Follow] Sent request to ${targetActor.handle} (pending acceptance)`);
  }
}
