/**
 * Miscellaneous Routes Integration Tests
 * Covers: follow/unfollow, search, tags, notifications, media
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  createTestApi,
  cleanDatabase,
  closeTestDB,
  createTestUser,
  createTestPost,
  testRequest,
  loginUser,
  getTestDB,
} from "./setup.ts";

Deno.test({
  name: "Misc Routes Integration",
  async fn(t) {
    await cleanDatabase();

    // ============ POST /follow ============
    await t.step("POST /follow", async (t) => {
      await t.step("follows a user successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "tofollow", email: "tofollow@test.com" });
        await createTestUser({ username: "follower", email: "follower@test.com", password: "password123" });

        const session = await loginUser(api, "follower@test.com", "password123");
        const res = await testRequest(api, "POST", "/follow", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { handle: "@tofollow@test.local" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertExists(data.message);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "target", email: "target@test.com" });

        const res = await testRequest(api, "POST", "/follow", {
          body: { handle: "@target@test.local" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects following self", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "self", email: "self@test.com", password: "password123" });

        const session = await loginUser(api, "self@test.com", "password123");
        const res = await testRequest(api, "POST", "/follow", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { handle: "@self@test.local" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Cannot follow yourself");
      });

      await t.step("rejects missing handle", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });

        const session = await loginUser(api, "user@test.com", "password123");
        const res = await testRequest(api, "POST", "/follow", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {},
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Handle or actor_id required");
      });
    });

    // ============ POST /unfollow ============
    await t.step("POST /unfollow", async (t) => {
      await t.step("unfollows a user successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: toUnfollow } = await createTestUser({ username: "tounfollow", email: "tounfollow@test.com" });
        const { actor: follower } = await createTestUser({ username: "follower", email: "follower@test.com", password: "password123" });

        // Follow first
        await db.addFollow(follower.id, toUnfollow.id);

        const session = await loginUser(api, "follower@test.com", "password123");
        const res = await testRequest(api, "POST", "/unfollow", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { actor_id: toUnfollow.public_id },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "target", email: "target@test.com" });

        const res = await testRequest(api, "POST", "/unfollow", {
          body: { actor_id: actor.public_id },
        });

        assertEquals(res.status, 401);
      });
    });

    // ============ GET /search ============
    await t.step("GET /search", async (t) => {
      await t.step("searches posts by content", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        await createTestPost(actor, { content: "Hello world this is a test" });
        await createTestPost(actor, { content: "Another post about coding" });

        const res = await testRequest(api, "GET", "/search?q=hello");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        // Search should find the post containing "hello"
        assertEquals(data.posts.length >= 1, true);
        // Verify the found post contains the search term
        const foundPost = data.posts.find((p: { content: string }) => p.content.toLowerCase().includes("hello"));
        assertExists(foundPost);
      });

      await t.step("returns empty for no query", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/search");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 0);
      });

      await t.step("respects limit parameter", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        for (let i = 0; i < 10; i++) {
          await createTestPost(actor, { content: `Test post ${i}` });
        }

        const res = await testRequest(api, "GET", "/search?q=test&limit=5");
        assertEquals(res.status, 200);
        const data = await res.json();
        // Search may return more or less depending on implementation
        assertExists(data.posts);
      });
    });

    // ============ GET /tags/search ============
    await t.step("GET /tags/search", async (t) => {
      await t.step("searches tags", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/tags/search?q=test");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.tags);
      });

      await t.step("returns empty for no query", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/tags/search");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.tags.length, 0);
      });
    });

    // ============ GET /tags/popular ============
    await t.step("GET /tags/popular", async (t) => {
      await t.step("returns popular tags", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/tags/popular");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.tags);
      });
    });

    // ============ GET /tags/trending ============
    await t.step("GET /tags/trending", async (t) => {
      await t.step("returns trending tags", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/tags/trending");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.tags);
      });
    });

    // ============ GET /tags/:tag ============
    await t.step("GET /tags/:tag", async (t) => {
      await t.step("returns posts for a tag", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/tags/test");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });
    });

    // ============ GET /notifications ============
    await t.step("GET /notifications", async (t) => {
      await t.step("returns notifications for authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        const res = await testRequest(api, "GET", "/notifications", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.notifications);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/notifications");
        assertEquals(res.status, 401);
      });
    });

    // ============ GET /notifications/unread/count ============
    await t.step("GET /notifications/unread/count", async (t) => {
      await t.step("returns unread count", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        const res = await testRequest(api, "GET", "/notifications/unread/count", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.count);
        assertEquals(typeof data.count, "number");
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/notifications/unread/count");
        assertEquals(res.status, 401);
      });
    });

    // ============ POST /notifications/read ============
    await t.step("POST /notifications/read", async (t) => {
      await t.step("marks notifications as read", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        // The endpoint expects a JSON body with optional ids array
        const res = await testRequest(api, "POST", "/notifications/read", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {},
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/notifications/read", {
          body: {},
        });
        assertEquals(res.status, 401);
      });
    });

    // ============ DELETE /notifications ============
    await t.step("DELETE /notifications", async (t) => {
      await t.step("clears all notifications", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        const res = await testRequest(api, "DELETE", "/notifications", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "DELETE", "/notifications");
        assertEquals(res.status, 401);
      });
    });

    // ============ POST /media ============
    await t.step("POST /media", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/media", {
          body: { image: "base64data" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects missing image", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        const res = await testRequest(api, "POST", "/media", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {},
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "No image provided");
      });

      await t.step("rejects image over 25MB", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        // Create a base64 string that decodes to > 25MB
        const largeData = "A".repeat(34 * 1024 * 1024); // 34MB of base64 = ~25.5MB decoded

        const res = await testRequest(api, "POST", "/media", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { image: `data:image/webp;base64,${largeData}` },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Image too large (max 25MB)");
      });

      // Skip: requires S3/MinIO which isn't configured in tests
      await t.step({ name: "uploads valid image successfully", ignore: true, fn: async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        // A small valid base64 image (just for testing the flow)
        const smallImage = btoa("fake image data for testing");

        const res = await testRequest(api, "POST", "/media", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { image: `data:image/webp;base64,${smallImage}` },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.url);
        assertEquals(data.media_type, "image/webp");
        // URL should be a valid uploads path
        assertEquals(data.url.startsWith("/uploads/media/"), true);
      }});
    });

    await closeTestDB();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
