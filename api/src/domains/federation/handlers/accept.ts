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
  const activity = await accept.getObject();
  if (!(activity instanceof Follow)) return;

  const sender = await accept.getActor();
  if (!sender || !isActor(sender)) return;

  const followerId = activity.actorId;
  if (!followerId) return;

  const followerActor = await db.getActorByUri(followerId.href);
  if (!followerActor) return;

  // Persist the accepted actor and add follow
  const acceptedActor = await persistActor(db, domain, sender);
  if (!acceptedActor) return;

  await db.addFollow(followerActor.id, acceptedActor.id);
  console.log(`[Accept] ${followerActor.handle} now following ${acceptedActor.handle}`);
}
