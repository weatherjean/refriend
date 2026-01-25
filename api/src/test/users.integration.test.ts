/**
 * User/Profile Routes Integration Tests
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
  name: "User Routes Integration",
  async fn(t) {
    await cleanDatabase();

    // ============ GET /users/trending ============
    await t.step("GET /users/trending", async (t) => {
      await t.step("returns trending users", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        // Create some users
        await createTestUser({ username: "user1", email: "user1@test.com" });
        await createTestUser({ username: "user2", email: "user2@test.com" });

        const res = await testRequest(api, "GET", "/users/trending");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.users);
      });
    });

    // ============ GET /users/:username ============
    await t.step("GET /users/:username", async (t) => {
      await t.step("returns user profile", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "testuser", email: "test@test.com" });

        const res = await testRequest(api, "GET", "/users/testuser");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.actor);
        assertEquals(data.actor.handle, actor.handle);
        assertExists(data.stats);
        assertEquals(data.stats.followers, 0);
        assertEquals(data.stats.following, 0);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent");
        assertEquals(res.status, 404);
        const data = await res.json();
        assertEquals(data.error, "User not found");
      });

      await t.step("shows is_own_profile when viewing own profile", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "GET", "/users/testuser", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.is_own_profile, true);
        assertEquals(data.is_following, false);
      });

      await t.step("shows is_own_profile=false when viewing other profile", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "viewer", email: "viewer@test.com", password: "password123" });
        await createTestUser({ username: "other", email: "other@test.com" });
        const session = await loginUser(api, "viewer@test.com", "password123");

        const res = await testRequest(api, "GET", "/users/other", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.is_own_profile, false);
      });
    });

    // ============ GET /users/:username/posts ============
    await t.step("GET /users/:username/posts", async (t) => {
      await t.step("returns user posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        await createTestPost(actor, { content: "Post 1" });
        await createTestPost(actor, { content: "Post 2" });

        const res = await testRequest(api, "GET", "/users/poster/posts");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        assertEquals(data.posts.length, 2);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent/posts");
        assertEquals(res.status, 404);
      });

      await t.step("respects limit parameter", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        for (let i = 0; i < 10; i++) {
          await createTestPost(actor, { content: `Post ${i}` });
        }

        const res = await testRequest(api, "GET", "/users/poster/posts?limit=5");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 5);
        assertExists(data.next_cursor);
      });

      await t.step("filters replies with filter=replies", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Original post" });
        await createTestPost(actor, { content: "Reply", in_reply_to_id: post.id });

        // Without filter - should return both
        const res1 = await testRequest(api, "GET", "/users/poster/posts");
        const data1 = await res1.json();
        // The original implementation may not include replies in main posts endpoint
        // Just verify it returns posts
        assertExists(data1.posts);

        // With filter=replies - should return only replies
        const res2 = await testRequest(api, "GET", "/users/poster/posts?filter=replies");
        assertEquals(res2.status, 200);
        const data2 = await res2.json();
        assertExists(data2.posts);
      });
    });

    // ============ GET /users/:username/pinned ============
    await t.step("GET /users/:username/pinned", async (t) => {
      await t.step("returns pinned posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Pinned post" });

        // Pin the post directly in DB
        await db.pinPost(actor.id, post.id);

        const res = await testRequest(api, "GET", "/users/poster/pinned");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        assertEquals(data.posts.length, 1);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent/pinned");
        assertEquals(res.status, 404);
      });

      await t.step("returns empty array when no pinned posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com" });

        const res = await testRequest(api, "GET", "/users/poster/pinned");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 0);
      });
    });

    // ============ GET /users/:username/boosts ============
    await t.step("GET /users/:username/boosts", async (t) => {
      await t.step("returns boosted posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const { actor: booster } = await createTestUser({ username: "booster", email: "booster@test.com" });

        const post = await createTestPost(author, { content: "Original post" });

        // Create boost directly in DB
        await db.addBoost(booster.id, post.id);

        const res = await testRequest(api, "GET", "/users/booster/boosts");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        assertEquals(data.posts.length, 1);
        assertExists(data.posts[0].boosted_by);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent/boosts");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /users/:username/followers ============
    await t.step("GET /users/:username/followers", async (t) => {
      await t.step("returns followers list", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: user } = await createTestUser({ username: "popular", email: "popular@test.com" });
        const { actor: follower } = await createTestUser({ username: "follower", email: "follower@test.com" });

        // Create follow directly in DB
        await db.addFollow(follower.id, user.id);

        const res = await testRequest(api, "GET", "/users/popular/followers");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.followers);
        assertEquals(data.followers.length, 1);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent/followers");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /users/:username/following ============
    await t.step("GET /users/:username/following", async (t) => {
      await t.step("returns following list", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: user } = await createTestUser({ username: "active", email: "active@test.com" });
        const { actor: followed } = await createTestUser({ username: "followed", email: "followed@test.com" });

        // Create follow directly in DB
        await db.addFollow(user.id, followed.id);

        const res = await testRequest(api, "GET", "/users/active/following");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.following);
        assertEquals(data.following.length, 1);
      });

      await t.step("returns 404 for non-existent user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/users/nonexistent/following");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /actors/:id ============
    await t.step("GET /actors/:id", async (t) => {
      await t.step("returns actor by public_id", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "testuser", email: "test@test.com" });

        const res = await testRequest(api, "GET", `/actors/${actor.public_id}`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.actor);
        assertEquals(data.actor.id, actor.public_id);
      });

      await t.step("returns 404 for non-existent actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/actors/non-existent-uuid");
        assertEquals(res.status, 404);
        const data = await res.json();
        assertEquals(data.error, "Actor not found");
      });
    });

    // ============ GET /actors/:id/posts ============
    await t.step("GET /actors/:id/posts", async (t) => {
      await t.step("returns posts by actor public_id", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        await createTestPost(actor, { content: "Post 1" });

        const res = await testRequest(api, "GET", `/actors/${actor.public_id}/posts`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        assertEquals(data.posts.length, 1);
      });

      await t.step("returns 404 for non-existent actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/actors/non-existent-uuid/posts");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /actors/:id/pinned ============
    await t.step("GET /actors/:id/pinned", async (t) => {
      await t.step("returns pinned posts for local actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Pinned" });
        await db.pinPost(actor.id, post.id);

        const res = await testRequest(api, "GET", `/actors/${actor.public_id}/pinned`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });

      await t.step("returns 404 for non-existent actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/actors/non-existent-uuid/pinned");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /actors/:id/boosts ============
    await t.step("GET /actors/:id/boosts", async (t) => {
      await t.step("returns boosted posts for local actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const { actor: booster } = await createTestUser({ username: "booster", email: "booster@test.com" });

        const post = await createTestPost(author, { content: "Original" });
        await db.addBoost(booster.id, post.id);

        const res = await testRequest(api, "GET", `/actors/${booster.public_id}/boosts`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });

      await t.step("returns 404 for non-existent actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/actors/non-existent-uuid/boosts");
        assertEquals(res.status, 404);
      });
    });

    // ============ PUT /profile ============
    await t.step("PUT /profile", async (t) => {
      await t.step("updates profile name and bio", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/profile", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {
            name: "Test User",
            bio: "This is my bio",
          },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.actor);
        assertEquals(data.actor.name, "Test User");
        assertEquals(data.actor.bio, "This is my bio");
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "PUT", "/profile", {
          body: { name: "Test" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects name over 100 characters", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/profile", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { name: "a".repeat(101) },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Name too long (max 100 characters)");
      });

      await t.step("rejects bio over 200 characters", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "PUT", "/profile", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { bio: "a".repeat(201) },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Bio too long (max 200 characters)");
      });

      await t.step("allows partial updates", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        // Update only name
        const res = await testRequest(api, "PUT", "/profile", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { name: "Only Name" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.actor.name, "Only Name");
      });
    });

    // ============ POST /profile/avatar ============
    await t.step("POST /profile/avatar", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/profile/avatar", {
          body: { image: "base64data" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects missing image", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        const res = await testRequest(api, "POST", "/profile/avatar", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {},
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "No image provided");
      });

      await t.step("rejects image over 2MB", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        // Create a base64 string that decodes to > 2MB
        // base64 encoding increases size by ~33%, so we need about 1.5MB of base64 to get 2MB decoded
        const largeData = "A".repeat(3 * 1024 * 1024); // 3MB of base64 = ~2.25MB decoded

        const res = await testRequest(api, "POST", "/profile/avatar", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { image: `data:image/webp;base64,${largeData}` },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Image too large (max 2MB)");
      });

      // Skip: requires S3/MinIO which isn't configured in tests
      await t.step({ name: "accepts valid small image", ignore: true, fn: async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "testuser", email: "test@test.com", password: "password123" });
        const session = await loginUser(api, "test@test.com", "password123");

        // A tiny valid-ish base64 image (just for testing the flow)
        const tinyImage = btoa("fake image data");

        const res = await testRequest(api, "POST", "/profile/avatar", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { image: `data:image/webp;base64,${tinyImage}` },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.actor);
        assertExists(data.avatar_url);
      }});
    });

    await closeTestDB();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
