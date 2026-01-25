/**
 * Auth Routes Integration Tests
 *
 * Run test database first:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * Run tests:
 *   TEST_DATABASE_URL=postgres://riff_test:riff_test@localhost:5433/riff_test deno task test
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  createTestApi,
  cleanDatabase,
  closeTestDB,
  createTestUser,
  testRequest,
  getSessionCookie,
  loginUser,
  getTestDB,
} from "./setup.ts";

// Clean database before each test file
Deno.test({
  name: "Auth Routes Integration",
  async fn(t) {
    // Setup: clean database once at start
    await cleanDatabase();

    await t.step("POST /auth/register", async (t) => {
      await t.step("creates user with valid data", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "newuser",
            email: "newuser@test.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.user.username, "newuser");
        assertExists(data.actor);
        assertExists(data.actor.id);

        // Should set session cookie
        const cookie = getSessionCookie(res);
        assertExists(cookie);
      });

      await t.step("rejects missing username", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            email: "test@example.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Username, email, and password required");
      });

      await t.step("rejects missing email", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "testuser",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Username, email, and password required");
      });

      await t.step("rejects invalid username format", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "Test User!",
            email: "test@example.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid username (lowercase, numbers, underscore only, max 26 chars)");
      });

      await t.step("rejects username over 26 chars", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "a".repeat(27),
            email: "test@example.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
      });

      await t.step("rejects invalid email format", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "testuser",
            email: "not-an-email",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid email address");
      });

      await t.step("rejects password under 8 characters", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "testuser",
            email: "test@example.com",
            password: "short",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Password must be at least 8 characters");
      });

      await t.step("rejects duplicate username", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        // Create first user
        await createTestUser({ username: "existinguser", email: "first@test.com" });

        // Try to register with same username
        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "existinguser",
            email: "second@test.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Username taken");
      });

      await t.step("rejects duplicate email", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        // Create first user
        await createTestUser({ username: "firstuser", email: "existing@test.com" });

        // Try to register with same email
        const res = await testRequest(api, "POST", "/auth/register", {
          body: {
            username: "seconduser",
            email: "existing@test.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Email already in use");
      });
    });

    await t.step("POST /auth/login", async (t) => {
      await t.step("logs in with valid credentials", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "loginuser",
          email: "login@test.com",
          password: "password123",
        });

        const res = await testRequest(api, "POST", "/auth/login", {
          body: {
            email: "login@test.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.user.username, "loginuser");
        assertExists(data.actor);

        const cookie = getSessionCookie(res);
        assertExists(cookie);
      });

      await t.step("rejects invalid email", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const res = await testRequest(api, "POST", "/auth/login", {
          body: {
            email: "wrong@test.com",
            password: "password123",
          },
        });

        assertEquals(res.status, 401);
        const data = await res.json();
        assertEquals(data.error, "Invalid credentials");
      });

      await t.step("rejects invalid password", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const res = await testRequest(api, "POST", "/auth/login", {
          body: {
            email: "test@test.com",
            password: "wrongpassword",
          },
        });

        assertEquals(res.status, 401);
        const data = await res.json();
        assertEquals(data.error, "Invalid credentials");
      });
    });

    await t.step("POST /auth/logout", async (t) => {
      await t.step("logs out authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const cookie = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "POST", "/auth/logout", { cookie });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("succeeds even without session", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/logout");

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });
    });

    await t.step("GET /auth/me", async (t) => {
      await t.step("returns user when authenticated", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const cookie = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "GET", "/auth/me", { cookie });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.user.username, "testuser");
        assertExists(data.actor);
      });

      await t.step("returns null when not authenticated", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/auth/me");

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.user, null);
        assertEquals(data.actor, null);
      });
    });

    await t.step("PUT /auth/password", async (t) => {
      await t.step("changes password with valid current password", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const cookie = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/auth/password", {
          cookie,
          body: {
            current_password: "password123",
            new_password: "newpassword456",
          },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);

        // Verify new password works
        const newLoginRes = await testRequest(api, "POST", "/auth/login", {
          body: {
            email: "test@test.com",
            password: "newpassword456",
          },
        });
        assertEquals(newLoginRes.status, 200);
      });

      await t.step("rejects when not authenticated", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "PUT", "/auth/password", {
          body: {
            current_password: "password123",
            new_password: "newpassword456",
          },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects wrong current password", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const cookie = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/auth/password", {
          cookie,
          body: {
            current_password: "wrongpassword",
            new_password: "newpassword456",
          },
        });

        assertEquals(res.status, 401);
        const data = await res.json();
        assertEquals(data.error, "Current password is incorrect");
      });

      await t.step("rejects new password under 8 characters", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const cookie = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/auth/password", {
          cookie,
          body: {
            current_password: "password123",
            new_password: "short",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Password must be at least 8 characters");
      });
    });

    await t.step("POST /auth/forgot-password", async (t) => {
      await t.step("returns success for valid email", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const res = await testRequest(api, "POST", "/auth/forgot-password", {
          body: { email: "test@test.com" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertExists(data.message);
      });

      await t.step("returns success for non-existent email (no enumeration)", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/forgot-password", {
          body: { email: "nonexistent@test.com" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("returns success for missing email", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/forgot-password", {
          body: {},
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rate limits repeated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        // First request succeeds
        const res1 = await testRequest(api, "POST", "/auth/forgot-password", {
          body: { email: "test@test.com" },
        });
        assertEquals(res1.status, 200);

        // Second request within 60 seconds should be rate limited
        const res2 = await testRequest(api, "POST", "/auth/forgot-password", {
          body: { email: "test@test.com" },
        });
        assertEquals(res2.status, 429);
        const data = await res2.json();
        assertExists(data.error);
      });
    });

    await t.step("GET /auth/reset-password/:token", async (t) => {
      await t.step("validates valid token", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { user } = await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const token = await db.createPasswordResetToken(user.id);

        const res = await testRequest(api, "GET", `/auth/reset-password/${token}`);

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertEquals(data.valid, true);
      });

      await t.step("rejects invalid token", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/auth/reset-password/invalid-token");

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid or expired reset link");
      });
    });

    await t.step("POST /auth/reset-password", async (t) => {
      await t.step("resets password with valid token", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { user } = await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const token = await db.createPasswordResetToken(user.id);

        const res = await testRequest(api, "POST", "/auth/reset-password", {
          body: {
            token,
            password: "newpassword456",
          },
        });

        assertEquals(res.status, 200);

        // Verify new password works
        const loginRes = await testRequest(api, "POST", "/auth/login", {
          body: {
            email: "test@test.com",
            password: "newpassword456",
          },
        });
        assertEquals(loginRes.status, 200);
      });

      await t.step("rejects invalid token", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/auth/reset-password", {
          body: {
            token: "invalid-token",
            password: "newpassword456",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid or expired reset link");
      });

      await t.step("cannot reuse token", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { user } = await createTestUser({
          username: "testuser",
          email: "test@test.com",
          password: "password123",
        });

        const token = await db.createPasswordResetToken(user.id);

        // First reset succeeds
        const res1 = await testRequest(api, "POST", "/auth/reset-password", {
          body: { token, password: "newpassword456" },
        });
        assertEquals(res1.status, 200);

        // Second reset fails
        const res2 = await testRequest(api, "POST", "/auth/reset-password", {
          body: { token, password: "anotherpassword789" },
        });
        assertEquals(res2.status, 400);
      });
    });

    // Cleanup
    await closeTestDB();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
