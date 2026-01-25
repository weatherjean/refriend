/**
 * CSRF Protection Middleware
 *
 * Validates CSRF tokens for state-changing requests (POST, PUT, DELETE, PATCH).
 * The CSRF token must be sent in the X-CSRF-Token header and match the token
 * stored in the user's session.
 */

import type { Context, Next } from "@hono/hono";
import { getCookie } from "@hono/hono/cookie";
import type { DB } from "../db.ts";

interface CsrfEnv {
  Variables: {
    db: DB;
  };
}

/**
 * CSRF middleware that validates tokens for mutation requests.
 * Skips validation for:
 * - GET, HEAD, OPTIONS requests (safe methods)
 * - Unauthenticated requests (no session cookie)
 * - Auth endpoints that don't require an existing session
 */
export async function csrfMiddleware(c: Context<CsrfEnv>, next: Next): Promise<void | Response> {
  const method = c.req.method;

  // Skip safe HTTP methods
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    await next();
    return;
  }

  // Skip auth endpoints that don't require a session
  const path = new URL(c.req.url).pathname;
  const exemptPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
  ];
  if (exemptPaths.some(exempt => path === exempt || path.startsWith(exempt + "/"))) {
    await next();
    return;
  }

  // Check for session cookie
  const sessionToken = getCookie(c, "session");
  if (!sessionToken) {
    // No session = no CSRF to validate (but route might still fail on auth)
    await next();
    return;
  }

  // Get CSRF token from header
  const csrfHeader = c.req.header("X-CSRF-Token");
  if (!csrfHeader) {
    return c.json({ error: "Missing CSRF token" }, 403);
  }

  // Validate against session
  const db = c.get("db");
  const session = await db.getSession(sessionToken);
  if (!session) {
    // Invalid session - let auth middleware handle this
    await next();
    return;
  }

  if (csrfHeader !== session.csrf_token) {
    return c.json({ error: "Invalid CSRF token" }, 403);
  }

  await next();
}
