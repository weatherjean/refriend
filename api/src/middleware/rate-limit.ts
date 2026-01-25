/**
 * Rate Limiting Middleware
 *
 * Provides Hono middleware for rate limiting API endpoints.
 */

import type { Context, Next } from "@hono/hono";
import { checkRateLimit, getRateLimitIdentifier } from "../cache.ts";

/**
 * Create a rate limiting middleware for a specific action.
 */
export function rateLimit(action: string) {
  return async (c: Context, next: Next) => {
    const userId = c.get("user")?.id;
    const identifier = getRateLimitIdentifier(c.req.raw, userId);

    const result = await checkRateLimit(identifier, action);

    // Add rate limit headers
    if (result.remaining !== undefined) {
      c.header("X-RateLimit-Remaining", result.remaining.toString());
    }

    if (result.limited) {
      c.header("Retry-After", result.retryAfter?.toString() || "60");
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }

    await next();
  };
}

/**
 * General API rate limiter - applied to all endpoints.
 */
export function generalRateLimit() {
  return rateLimit("api:general");
}
