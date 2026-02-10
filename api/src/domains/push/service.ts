/**
 * Push Notifications Service
 *
 * Sends Web Push notifications and manages VAPID keys.
 */

import webpush from "web-push";
import type { DB } from "../../db.ts";
import type { NotificationType } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import { logger } from "../../logger.ts";

let vapidConfigured = false;
let cachedVapidPublicKey: string | null = null;

/**
 * Initialize VAPID keys for web push.
 * Tries env vars first, falls back to auto-generated keys stored in Deno KV.
 */
export async function initVapid(): Promise<void> {
  let publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  let privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const domain = Deno.env.get("DOMAIN") || "localhost";

  if (publicKey && privateKey) {
    webpush.setVapidDetails(`https://${domain}`, publicKey, privateKey);
    vapidConfigured = true;
    cachedVapidPublicKey = publicKey;
    logger.info("[Push] VAPID configured from environment variables");
    return;
  }

  // Auto-generate and persist in Deno KV for local dev
  try {
    const kv = await Deno.openKv(Deno.env.get("DENO_KV_PATH"));
    const stored = await kv.get<{ publicKey: string; privateKey: string }>(["vapid-keys"]);

    if (stored.value) {
      publicKey = stored.value.publicKey;
      privateKey = stored.value.privateKey;
    } else {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await kv.set(["vapid-keys"], { publicKey, privateKey });
      logger.info("[Push] Generated and stored new VAPID keys in Deno KV");
    }

    kv.close();
    webpush.setVapidDetails(`https://${domain}`, publicKey, privateKey);
    vapidConfigured = true;
    cachedVapidPublicKey = publicKey;
    logger.info("[Push] VAPID configured from Deno KV");
  } catch (err) {
    logger.error("[Push] Failed to initialize VAPID keys:", err);
  }
}

/**
 * Get the VAPID public key for client-side subscription
 */
export function getVapidPublicKey(): string | null {
  if (!vapidConfigured) return null;
  return cachedVapidPublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
}

/**
 * Human-readable title for each notification type
 */
function notificationTitle(type: NotificationType): string {
  switch (type) {
    case "like": return "New like";
    case "boost": return "New boost";
    case "follow": return "New follower";
    case "reply": return "New reply";
    case "mention": return "New mention";
    case "feed_mod": return "Feed moderator";
    case "feed_unmod": return "Removed as moderator";
    default: return "New notification";
  }
}

/**
 * Build a push notification URL based on notification type
 */
function notificationUrl(
  type: NotificationType,
  actorHandle: string,
  postAuthorHandle?: string,
  postPublicId?: string,
  feedSlug?: string,
): string {
  if (type === "follow") {
    return `/a/${actorHandle}`;
  }
  if ((type === "feed_mod" || type === "feed_unmod") && feedSlug) {
    return `/f/${feedSlug}`;
  }
  if (postPublicId && postAuthorHandle) {
    return `/a/${postAuthorHandle}/post/${postPublicId}`;
  }
  return "/notifications";
}

/**
 * Send a push notification to all subscriptions of a target actor.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function sendPushNotification(
  db: DB,
  targetActorId: number,
  type: NotificationType,
  actorName: string,
  actorHandle: string,
  postAuthorHandle?: string,
  postPublicId?: string,
  postContentPreview?: string,
  feedSlug?: string,
): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = await repository.getSubscriptionsForActor(db, targetActorId);
  if (subscriptions.length === 0) return;

  const title = notificationTitle(type);
  let body = actorName || actorHandle;
  if (type === "like") body += " liked your post";
  else if (type === "boost") body += " boosted your post";
  else if (type === "follow") body += " followed you";
  else if (type === "reply") body += postContentPreview ? `: ${postContentPreview.slice(0, 100)}` : " replied to your post";
  else if (type === "mention") body += postContentPreview ? `: ${postContentPreview.slice(0, 100)}` : " mentioned you";
  else if (type === "feed_mod") body += ` made you a moderator${feedSlug ? ` of ${feedSlug}` : ""}`;
  else if (type === "feed_unmod") body += ` removed you as moderator${feedSlug ? ` of ${feedSlug}` : ""}`;

  const url = notificationUrl(type, actorHandle, postAuthorHandle, postPublicId, feedSlug);

  const payload = JSON.stringify({ title, body, url });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or invalid — clean up
          await repository.removeExpiredSubscription(db, sub.endpoint);
          logger.info(`[Push] Removed expired subscription: ${sub.endpoint.slice(0, 50)}...`);
        } else {
          logger.error("[Push] Failed to send notification:", err);
        }
      }
    })
  );
}
