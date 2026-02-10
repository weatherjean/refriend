/**
 * Push Notifications Repository
 *
 * Database operations for Web Push subscriptions.
 */

import type { DB } from "../../db.ts";

export interface PushSubscription {
  id: number;
  actor_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: Date;
}

const MAX_SUBSCRIPTIONS_PER_ACTOR = 20;

/**
 * Save (upsert) a push subscription for an actor.
 * Enforces a per-actor limit to prevent abuse.
 */
export async function saveSubscription(
  db: DB,
  actorId: number,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<void> {
  await db.query(async (client) => {
    // Enforce per-actor limit — delete oldest if at cap
    const countResult = await client.queryObject<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE actor_id = ${actorId}
    `;
    if (countResult.rows[0].count >= MAX_SUBSCRIPTIONS_PER_ACTOR) {
      await client.queryArray`
        DELETE FROM push_subscriptions WHERE id IN (
          SELECT id FROM push_subscriptions
          WHERE actor_id = ${actorId}
          ORDER BY created_at ASC
          LIMIT ${countResult.rows[0].count - MAX_SUBSCRIPTIONS_PER_ACTOR + 1}
        )
      `;
    }

    await client.queryArray`
      INSERT INTO push_subscriptions (actor_id, endpoint, p256dh, auth)
      VALUES (${actorId}, ${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (actor_id, endpoint)
      DO UPDATE SET p256dh = ${p256dh}, auth = ${auth}
    `;
  });
}

/**
 * Remove a push subscription by actor and endpoint
 */
export async function removeSubscription(
  db: DB,
  actorId: number,
  endpoint: string
): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      DELETE FROM push_subscriptions
      WHERE actor_id = ${actorId} AND endpoint = ${endpoint}
    `;
  });
}

/**
 * Get all push subscriptions for an actor
 */
export async function getSubscriptionsForActor(
  db: DB,
  actorId: number
): Promise<PushSubscription[]> {
  return await db.query(async (client) => {
    const result = await client.queryObject<PushSubscription>`
      SELECT id, actor_id, endpoint, p256dh, auth, created_at
      FROM push_subscriptions
      WHERE actor_id = ${actorId}
    `;
    return result.rows;
  });
}

/**
 * Remove an expired/invalid subscription by endpoint (called on 410 responses)
 */
export async function removeExpiredSubscription(
  db: DB,
  endpoint: string
): Promise<void> {
  await db.query(async (client) => {
    await client.queryArray`
      DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}
    `;
  });
}
