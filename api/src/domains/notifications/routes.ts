/**
 * Notifications Routes
 *
 * HTTP endpoints for notifications.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import * as service from "./service.ts";

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
  routes.get("/", async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = c.get("db");
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    const notifications = await service.getNotifications(db, actor.id, limit, offset);

    return c.json({ notifications });
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
