/**
 * Authentication middleware
 *
 * Handles session verification and user/actor injection into context.
 */

import { getCookie } from "@hono/hono/cookie";
import type { Context, Next } from "@hono/hono";
import type { DB } from "../db.ts";
import type { User, Actor } from "../shared/types.ts";

export interface AuthEnv {
  Variables: {
    db: DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

/**
 * Middleware that checks for a session cookie and populates user/actor context
 */
export async function authMiddleware(c: Context<AuthEnv>, next: Next): Promise<void | Response> {
  const db = c.get("db");

  const token = getCookie(c, "session");
  if (token) {
    const session = await db.getSession(token);
    if (session) {
      const user = await db.getUserById(session.user_id);
      const actor = user ? await db.getActorByUserId(user.id) : null;
      c.set("user", user);
      c.set("actor", actor);
    } else {
      c.set("user", null);
      c.set("actor", null);
    }
  } else {
    c.set("user", null);
    c.set("actor", null);
  }

  await next();
}

/**
 * Middleware that requires authentication
 * Returns 401 if user is not logged in
 */
export async function requireAuth(c: Context<AuthEnv>, next: Next): Promise<void | Response> {
  const user = c.get("user");
  const actor = c.get("actor");

  if (!user || !actor) {
    return c.json({ error: "Authentication required" }, 401);
  }

  await next();
}
