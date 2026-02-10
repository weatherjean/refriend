/**
 * Notifications Routes
 *
 * HTTP endpoints for notifications.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as service from "./service.ts";
import { parseIntSafe } from "../../shared/utils.ts";

interface NotificationsEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createNotificationRoutes(): Hono<NotificationsEnv> {
  const routes = new Hono<NotificationsEnv>();

  // GET /notifications - Get user's notifications
  // Supports cursor-based pagination via `before` parameter (notification ID)
  routes.get("/", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const limit = Math.min(parseIntSafe(c.req.query("limit")) ?? 50, 100);
    const before = parseIntSafe(c.req.query("before")) ?? undefined;

    const { notifications, next_cursor } = await service.getNotifications(db, actor.id, limit, before);

    return c.json({ notifications, next_cursor });
  });

  // GET /notifications/unread/count - Get unread notification count
  routes.get("/unread/count", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const count = await service.getUnreadCount(db, actor.id);

    return c.json({ count });
  });

  // POST /notifications/read - Mark notifications as read
  routes.post("/read", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const body = await c.req.json<{ ids?: number[] }>();

    await service.markAsRead(db, actor.id, body.ids);

    return c.json({ ok: true });
  });

  // GET /notifications/preferences - Get notification preferences
  routes.get("/preferences", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const prefs = await service.getNotificationPreferences(db, actor.id);

    return c.json(prefs);
  });

  // PUT /notifications/preferences - Update notification preferences
  routes.put("/preferences", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const ALLOWED_KEYS = ["likes", "replies", "mentions", "boosts", "follows"];
    const prefs: Record<string, boolean> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        if (typeof body[key] !== "boolean") {
          return c.json({ error: `${key} must be a boolean` }, 400);
        }
        prefs[key] = body[key] as boolean;
      }
    }

    const db = c.get("db");
    const updated = await service.updateNotificationPreferences(db, actor.id, prefs);

    return c.json(updated);
  });

  // DELETE /notifications - Delete notifications
  routes.delete("/", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const ids = c.req.query("ids")?.split(",").map(Number).filter(n => !isNaN(n));

    await service.deleteNotifications(db, actor.id, ids?.length ? ids : undefined);

    return c.json({ ok: true });
  });

  return routes;
}

// Re-export service functions for use by other modules
export { createNotification, removeNotification } from "./service.ts";
