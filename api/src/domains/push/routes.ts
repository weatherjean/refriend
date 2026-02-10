/**
 * Push Notification Routes
 *
 * HTTP endpoints for managing Web Push subscriptions.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import * as service from "./service.ts";

interface PushEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createPushRoutes(): Hono<PushEnv> {
  const routes = new Hono<PushEnv>();

  // GET /push/vapid-key — returns the VAPID public key
  routes.get("/vapid-key", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const key = service.getVapidPublicKey();
    if (!key) {
      return c.json({ error: "Push notifications not configured" }, 503);
    }

    return c.json({ key });
  });

  // POST /push/subscribe — save a push subscription
  routes.post("/subscribe", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    let body: { endpoint: string; keys: { p256dh: string; auth: string } };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return c.json({ error: "Invalid subscription data" }, 400);
    }

    const db = c.get("db");
    await repository.saveSubscription(db, actor.id, body.endpoint, body.keys.p256dh, body.keys.auth);

    return c.json({ ok: true });
  });

  // DELETE /push/subscribe — remove a push subscription
  routes.delete("/subscribe", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    let body: { endpoint: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.endpoint) {
      return c.json({ error: "Missing endpoint" }, 400);
    }

    const db = c.get("db");
    await repository.removeSubscription(db, actor.id, body.endpoint);

    return c.json({ ok: true });
  });

  return routes;
}
