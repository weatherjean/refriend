/**
 * Stats Routes
 *
 * HTTP endpoint for public server statistics.
 */

import { Hono } from "@hono/hono";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import { getStats } from "./service.ts";

interface StatsEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createStatsRoutes(): Hono<StatsEnv> {
  const routes = new Hono<StatsEnv>();

  // GET /stats - Public server statistics (no auth required)
  routes.get("/stats", async (c) => {
    const db = c.get("db");
    const stats = await getStats(db);
    return c.json(stats);
  });

  return routes;
}
