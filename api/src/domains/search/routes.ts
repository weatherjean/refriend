/**
 * Search Routes
 *
 * HTTP endpoints for searching users, communities, and posts.
 * Includes remote actor lookup via ActivityPub.
 */

import { Hono } from "@hono/hono";
import type { Federation } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import type { CommunityDB } from "../communities/repository.ts";
import { search } from "./service.ts";

interface SearchEnv {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createSearchRoutes(federation: Federation<void>): Hono<SearchEnv> {
  const routes = new Hono<SearchEnv>();

  // GET /search - Unified search endpoint
  routes.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    if (!query.trim()) {
      return c.json({ users: [], posts: [], postsLowConfidence: false });
    }

    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const currentUser = c.get("user");

    const type = (c.req.query("type") || "all") as "all" | "users" | "posts";
    const handleOnly = c.req.query("handleOnly") === "true";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    // Create federation context for remote actor lookups
    const ctx = federation.createContext(c.req.raw, undefined);

    const result = await search(ctx, db, domain, query, {
      type,
      handleOnly,
      limit,
      currentActorId: currentActor?.id,
      currentUsername: currentUser?.username,
      communityDb,
    });

    return c.json(result);
  });

  return routes;
}
