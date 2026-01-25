/**
 * Reject Activity Handler
 *
 * Handles incoming Reject activities (e.g., follow rejection).
 */

import { Follow, Reject, isActor, type Context } from "@fedify/fedify";
import type { DB } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";

/**
 * Process a Reject activity (e.g., follow rejection)
 */
export async function processReject(
  ctx: Context<void>,
  db: DB,
  domain: string,
  reject: Reject,
  _direction: "inbound" | "outbound"
): Promise<void> {
  const rejectorAP = await reject.getActor();
  if (!rejectorAP || !isActor(rejectorAP)) {
    console.log("[Reject] No valid actor found");
    return;
  }

  // Persist the rejecting actor
  const rejector = await persistActor(db, domain, rejectorAP);
  if (!rejector) {
    console.log("[Reject] Failed to persist rejector");
    return;
  }

  // Get the object being rejected (usually a Follow)
  const object = await reject.getObject();
  if (!(object instanceof Follow)) {
    console.log("[Reject] Object is not a Follow activity");
    return;
  }

  // Get the actor who sent the follow request (being rejected)
  const followerAP = await object.getActor();
  if (!followerAP || !isActor(followerAP)) {
    console.log("[Reject] No valid follower actor found");
    return;
  }

  const follower = await persistActor(db, domain, followerAP);
  if (!follower) {
    console.log("[Reject] Failed to persist follower");
    return;
  }

  // Remove the pending follow request
  await db.removeFollow(follower.id, rejector.id);
  console.log(`[Reject] Follow rejected: ${follower.handle} -> ${rejector.handle}`);
}
