/**
 * Federation Activity Processor
 *
 * Main entry point for processing ActivityPub activities.
 */

import {
  Accept,
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Note,
  Reject,
  Tombstone,
  Undo,
  isActor,
  type Context,
} from "@fedify/fedify";
import type { DB, Actor } from "../../db.ts";
import { persistActor } from "./actor-persistence.ts";
import { serializeActivity, getActivityType } from "./utils/send.ts";
import {
  processCreate,
  processLike,
  processAnnounce,
  processFollow,
  processAccept,
  processReject,
  processUndo,
  processDelete,
} from "./handlers/index.ts";

// Activity processing result
export interface ProcessResult {
  success: boolean;
  activity?: Awaited<ReturnType<DB["storeActivity"]>>;
  error?: string;
}

type Activity = Create | Like | Follow | Delete | Undo | Accept | Reject | Announce;

/**
 * Get object info from activity (safe - handles localhost errors)
 */
async function getObjectInfo(activity: Activity): Promise<{ uri: string | null; type: string | null }> {
  try {
    if (activity instanceof Create) {
      const obj = await activity.getObject();
      if (obj instanceof Note) {
        return { uri: obj.id?.href ?? null, type: "Note" };
      }
    }
    if (activity instanceof Like) {
      return { uri: activity.objectId?.href ?? null, type: "Note" };
    }
    if (activity instanceof Follow) {
      return { uri: activity.objectId?.href ?? null, type: "Person" };
    }
    if (activity instanceof Announce) {
      return { uri: activity.objectId?.href ?? null, type: "Note" };
    }
    if (activity instanceof Delete) {
      const obj = await activity.getObject();
      if (obj instanceof Tombstone || obj instanceof Note) {
        return { uri: obj.id?.href ?? null, type: "Note" };
      }
    }
    if (activity instanceof Undo) {
      const obj = await activity.getObject();
      if (obj instanceof Like) {
        return { uri: obj.id?.href ?? null, type: "Like" };
      }
      if (obj instanceof Follow) {
        return { uri: obj.id?.href ?? null, type: "Follow" };
      }
      if (obj instanceof Announce) {
        return { uri: obj.id?.href ?? null, type: "Announce" };
      }
    }
    if (activity instanceof Accept) {
      const obj = await activity.getObject();
      if (obj instanceof Follow) {
        return { uri: obj.id?.href ?? null, type: "Follow" };
      }
    }
    if (activity instanceof Reject) {
      const obj = await activity.getObject();
      if (obj instanceof Follow) {
        return { uri: obj.id?.href ?? null, type: "Follow" };
      }
    }
  } catch {
    // In localhost dev environments, getObject might fail
  }
  return { uri: null, type: null };
}

/**
 * Main activity processing function
 */
export async function processActivity(
  ctx: Context<void>,
  db: DB,
  domain: string,
  activity: Activity,
  direction: "inbound" | "outbound",
  localUsername?: string // For outbound activities, the local user's username
): Promise<ProcessResult> {
  const activityUri = activity.id?.href;
  if (!activityUri) {
    return { success: false, error: "Activity has no URI" };
  }

  // Check for duplicate (idempotency) - only for outbound activities
  // Inbound activities are already deduplicated by Fedify via per-inbox idempotency
  if (direction === "outbound") {
    const existing = await db.getActivityByUri(activityUri);
    if (existing) {
      console.log(`[${getActivityType(activity)}] Already processed: ${activityUri}`);
      return { success: true, activity: existing };
    }
  }

  try {
    // Process based on activity type
    if (activity instanceof Create) {
      await processCreate(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Like) {
      await processLike(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Announce) {
      await processAnnounce(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Follow) {
      await processFollow(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Undo) {
      await processUndo(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Delete) {
      await processDelete(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Accept) {
      await processAccept(ctx, db, domain, activity, direction);
    } else if (activity instanceof Reject) {
      await processReject(ctx, db, domain, activity, direction);
    }

    console.log(`[${getActivityType(activity)}] Processed (${direction}): ${activityUri}`);

    // Only store outbound activities (for serving our outbox)
    // Inbound activities don't need to be stored - Fedify handles deduplication via KV
    if (direction === "outbound") {
      // Get local actor for storing activity
      let actor: Actor | null = null;
      if (localUsername) {
        actor = await db.getActorByUsername(localUsername);
      }

      if (!actor) {
        // Try to resolve from activity as fallback
        try {
          const actorAP = await activity.getActor();
          if (actorAP && isActor(actorAP)) {
            actor = await persistActor(db, domain, actorAP);
          }
        } catch {
          // In localhost dev, getActor might fail
        }
      }

      if (actor) {
        const objectInfo = await getObjectInfo(activity);
        const rawJson = await serializeActivity(activity);

        const storedActivity = await db.storeActivity({
          uri: activityUri,
          type: getActivityType(activity),
          actor_id: actor.id,
          object_uri: objectInfo.uri,
          object_type: objectInfo.type,
          raw_json: rawJson,
          direction,
        });

        return { success: true, activity: storedActivity };
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`[${getActivityType(activity)}] Error:`, error);
    return { success: false, error: String(error) };
  }
}
