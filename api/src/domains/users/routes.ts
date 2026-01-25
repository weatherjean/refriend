/**
 * Users Routes
 *
 * HTTP endpoints for user authentication and profile management.
 */

import { Hono } from "@hono/hono";
import { getCookie, setCookie, deleteCookie } from "@hono/hono/cookie";
import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";
import type { CommunityDB } from "../communities/repository.ts";
import * as service from "./service.ts";
import { sanitizeUser, sanitizeActor } from "./types.ts";
import { saveAvatar } from "../../storage.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";

interface UsersEnv {
  Variables: {
    db: DB;
    communityDb: CommunityDB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}

export function createUserRoutes(): Hono<UsersEnv> {
  const routes = new Hono<UsersEnv>();

  // ============ Auth Routes ============

  // POST /auth/register - rate limited to prevent spam registrations
  routes.post("/auth/register", rateLimit("auth:register"), async (c) => {
    const body = await c.req.json<{ username: string; password: string; email: string }>();
    const db = c.get("db");
    const domain = c.get("domain");

    const result = await service.register(db, domain, body);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    setCookie(c, "session", result.sessionToken!, {
      httpOnly: true,
      secure: service.isSecureRequest(c.req.raw, domain),
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return c.json({
      user: sanitizeUser(result.user!),
      actor: sanitizeActor(result.actor!, domain),
      csrfToken: result.csrfToken,
    });
  });

  // POST /auth/login - rate limited to prevent brute force
  routes.post("/auth/login", rateLimit("auth:login"), async (c) => {
    const body = await c.req.json<{ email: string; password: string }>();
    const db = c.get("db");
    const domain = c.get("domain");

    const result = await service.login(db, body);

    if (!result.success) {
      return c.json({ error: result.error }, 401);
    }

    setCookie(c, "session", result.sessionToken!, {
      httpOnly: true,
      secure: service.isSecureRequest(c.req.raw, domain),
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return c.json({
      user: sanitizeUser(result.user!),
      actor: result.actor ? sanitizeActor(result.actor, domain) : null,
      csrfToken: result.csrfToken,
    });
  });

  // POST /auth/logout
  routes.post("/auth/logout", async (c) => {
    const token = getCookie(c, "session");
    await service.logout(c.get("db"), token);
    deleteCookie(c, "session");
    return c.json({ ok: true });
  });

  // GET /auth/me
  routes.get("/auth/me", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");
    const domain = c.get("domain");
    const db = c.get("db");

    const result = service.getCurrentUser(user, actor, domain);
    if (!result) {
      return c.json({ user: null, actor: null, csrfToken: null });
    }

    // Get CSRF token from session
    const sessionToken = getCookie(c, "session");
    let csrfToken: string | null = null;
    if (sessionToken) {
      const session = await db.getSession(sessionToken);
      if (session) {
        csrfToken = session.csrf_token;
      }
    }

    return c.json({ ...result, csrfToken });
  });

  // PUT /auth/password
  routes.put("/auth/password", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json<{ current_password: string; new_password: string }>();
    const result = await service.changePassword(c.get("db"), user.id, body);

    if (!result.success) {
      return c.json({ error: result.error }, result.error === "Current password is incorrect" ? 401 : 400);
    }

    return c.json({ ok: true });
  });

  // POST /auth/forgot-password - rate limited to prevent email spam
  routes.post("/auth/forgot-password", rateLimit("auth:password-reset"), async (c) => {
    const { email } = await c.req.json<{ email: string }>();
    const result = await service.requestPasswordReset(c.get("db"), email);

    if (!result.success && result.error?.includes("wait")) {
      return c.json({ error: result.error }, 429);
    }

    return c.json({
      ok: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  });

  // GET /auth/reset-password/:token
  routes.get("/auth/reset-password/:token", async (c) => {
    const token = c.req.param("token");
    const result = await service.validateResetToken(c.get("db"), token);

    if (!result.valid) {
      return c.json({ error: "Invalid or expired reset link" }, 400);
    }

    return c.json({ ok: true, valid: true });
  });

  // POST /auth/reset-password
  routes.post("/auth/reset-password", async (c) => {
    const body = await c.req.json<{ token: string; password: string }>();
    const result = await service.resetPassword(c.get("db"), body);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ ok: true, message: "Password updated successfully" });
  });

  // ============ Profile Routes ============

  // GET /users/trending - must be before :username
  routes.get("/users/trending", async (c) => {
    const result = await service.getTrendingUsers(c.get("db"));
    return c.json(result);
  });

  // GET /users/:username
  routes.get("/users/:username", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const result = await service.getProfile(db, username, currentActor?.id, domain);

    if (!result) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(result);
  });

  // GET /users/:username/posts - Get posts by a specific user
  routes.get("/users/:username/posts", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const communityDb = c.get("communityDb");
    const filter = c.req.query("filter");
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const result = await service.getUserPosts(db, username, {
      filter,
      sort,
      limit,
      before,
      currentActorId: currentActor?.id,
      domain,
      communityDb,
    });

    if (!result) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(result);
  });

  // GET /users/:username/pinned - Get pinned posts for a user
  routes.get("/users/:username/pinned", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const result = await service.getUserPinnedPosts(db, username, currentActor?.id, domain, communityDb);

    if (!result) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(result);
  });

  // GET /users/:username/boosts - Get posts boosted by a user
  routes.get("/users/:username/boosts", async (c) => {
    const username = c.req.param("username");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const result = await service.getUserBoostedPosts(db, username, {
      limit,
      before,
      currentActorId: currentActor?.id,
      domain,
      communityDb,
    });

    if (!result) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(result);
  });

  // ============ Actor Routes ============

  // GET /actors/:id - Get actor by ID (works for both local and remote)
  routes.get("/actors/:id", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const result = await service.getActorById(db, publicId, currentActor?.id, domain);

    if (!result) {
      return c.json({ error: "Actor not found" }, 404);
    }

    return c.json(result);
  });

  // GET /actors/:id/posts - Get posts by actor ID (works for both local and remote)
  routes.get("/actors/:id/posts", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const communityDb = c.get("communityDb");
    const filter = c.req.query("filter");
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const result = await service.getActorPosts(db, publicId, {
      filter,
      sort,
      limit,
      before,
      currentActorId: currentActor?.id,
      domain,
      communityDb,
    });

    if (!result) {
      return c.json({ error: "Actor not found" }, 404);
    }

    return c.json(result);
  });

  // GET /actors/:id/pinned - Get pinned posts for an actor
  // For local actors: returns from pinned_posts table
  // For remote actors: returns empty (federation fetch not supported in domain routes)
  routes.get("/actors/:id/pinned", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");

    const result = await service.getActorPinnedPosts(db, publicId, currentActor?.id, domain, communityDb);

    if (!result) {
      return c.json({ error: "Actor not found" }, 404);
    }

    return c.json({ posts: result.posts });
  });

  // GET /actors/:id/boosts - Get boosted posts for an actor (local only)
  routes.get("/actors/:id/boosts", async (c) => {
    const publicId = c.req.param("id");
    const db = c.get("db");
    const communityDb = c.get("communityDb");
    const domain = c.get("domain");
    const currentActor = c.get("actor");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const before = c.req.query("before") ? parseInt(c.req.query("before")!) : undefined;

    const result = await service.getActorBoostedPosts(db, publicId, {
      limit,
      before,
      currentActorId: currentActor?.id,
      domain,
      communityDb,
    });

    if (!result) {
      return c.json({ error: "Actor not found" }, 404);
    }

    return c.json(result);
  });

  // ============ Profile Update Routes ============

  // PUT /profile - Update profile (name, bio)
  routes.put("/profile", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");

    if (!user || !actor) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const body = await c.req.json();

    const result = await service.updateProfile(db, actor.id, body, domain);

    if (!result.success) {
      return c.json({ error: result.error }, result.error === "Failed to update profile" ? 500 : 400);
    }

    return c.json({ actor: result.actor });
  });

  // POST /profile/avatar - Upload avatar
  routes.post("/profile/avatar", async (c) => {
    const user = c.get("user");
    const actor = c.get("actor");

    if (!user || !actor) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const db = c.get("db");
    const domain = c.get("domain");
    const body = await c.req.json();
    const { image } = body;

    const result = await service.updateAvatar(db, actor.id, image, domain, saveAvatar);

    if (!result.success) {
      return c.json({ error: result.error }, result.error === "Failed to update avatar" ? 500 : 400);
    }

    return c.json({ actor: result.actor, avatar_url: result.avatar_url });
  });

  return routes;
}

// Re-export types for convenience
export { sanitizeUser, sanitizeActor } from "./types.ts";
