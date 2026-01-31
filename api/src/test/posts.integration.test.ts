/**
 * Post Routes Integration Tests
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  createTestApi,
  cleanDatabase,
  closeTestDB,
  createTestUser,
  createTestPost,
  testRequest,
  getSessionCookie,
  loginUser,
  getTestDB,
} from "./setup.ts";

Deno.test({
  name: "Post Routes Integration",
  async fn(t) {
    await cleanDatabase();

    // ============ GET /timeline ============
    await t.step("GET /timeline", async (t) => {
      await t.step("returns timeline for authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        // Create a user who will view the timeline
        await createTestUser({ username: "viewer", email: "viewer@test.com", password: "password123" });
        const session = await loginUser(api, "viewer@test.com", "password123");

        // Create another user who posts content
        const { actor: poster } = await createTestUser({ username: "poster", email: "poster@test.com" });
        await createTestPost(poster, { content: "Hello world!" });
        await createTestPost(poster, { content: "Second post" });

        // Viewer follows poster (timeline shows posts from followed users)
        const viewer = await db.getActorByUsername("viewer");
        await db.addFollow(viewer!.id, poster.id, "accepted");

        const res = await testRequest(api, "GET", "/timeline", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
        assertEquals(data.posts.length, 2);
      });

      await t.step("respects limit parameter", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        // Create viewer
        await createTestUser({ username: "viewer", email: "viewer@test.com", password: "password123" });
        const session = await loginUser(api, "viewer@test.com", "password123");

        // Create poster with many posts
        const { actor: poster } = await createTestUser({ username: "poster", email: "poster@test.com" });
        for (let i = 0; i < 10; i++) {
          await createTestPost(poster, { content: `Post ${i}` });
        }

        // Viewer follows poster
        const viewer = await db.getActorByUsername("viewer");
        await db.addFollow(viewer!.id, poster.id, "accepted");

        const res = await testRequest(api, "GET", "/timeline?limit=5", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 5);
      });

      await t.step("requires authentication", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/timeline");
        assertEquals(res.status, 401);
      });
    });

    // ============ GET /posts/hot ============
    await t.step("GET /posts/hot", async (t) => {
      await t.step("returns hot posts for authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");
        await createTestPost(actor, { content: "Hot post!" });

        const res = await testRequest(api, "GET", "/posts/hot", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });

      await t.step("works without authentication (public feed)", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/posts/hot");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });
    });

    // ============ POST /posts (validation tests) ============
    await t.step("POST /posts validation", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/posts", {
          body: { content: "Test post" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects empty content", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { content: "" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Content required");
      });

      await t.step("rejects content over 500 characters", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { content: "a".repeat(501) },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Content too long (max 500 characters)");
      });

      await t.step("rejects more than 4 attachments", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {
            content: "Post with attachments",
            attachments: [
              { url: "/uploads/1.webp", width: 100, height: 100 },
              { url: "/uploads/2.webp", width: 100, height: 100 },
              { url: "/uploads/3.webp", width: 100, height: 100 },
              { url: "/uploads/4.webp", width: 100, height: 100 },
              { url: "/uploads/5.webp", width: 100, height: 100 },
            ],
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Maximum 4 attachments allowed");
      });

      await t.step("rejects link_url with attachments", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {
            content: "Post",
            link_url: "https://example.com",
            attachments: [{ url: "/uploads/1.webp", width: 100, height: 100 }],
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Cannot have both link and attachments");
      });

      await t.step("rejects invalid link_url", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {
            content: "Post with invalid link",
            link_url: "not-a-url",
          },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid link URL");
      });

      await t.step("rejects reply to non-existent post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: {
            content: "Reply to nothing",
            in_reply_to: "non-existent-uuid",
          },
        });

        assertEquals(res.status, 404);
        const data = await res.json();
        assertEquals(data.error, "Parent post not found");
      });
    });

    // ============ POST /posts (success case) ============
    await t.step("POST /posts", async (t) => {
      await t.step("creates post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { content: "Hello world!" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.post);
        assertExists(data.post.id);
      });

      await t.step("creates reply successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const parent = await createTestPost(actor, { content: "Parent post" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts", {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { content: "Reply!", in_reply_to: parent.public_id },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.post);
      });
    });

    // ============ GET /posts/:id ============
    await t.step("GET /posts/:id", async (t) => {
      await t.step("returns post by public_id", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "GET", `/posts/${post.public_id}`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.post);
      });

      await t.step("returns 404 for non-existent post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/posts/non-existent-uuid");
        assertEquals(res.status, 404);
      });

      await t.step("returns ancestors for reply", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const parent = await createTestPost(actor, { content: "Parent post" });
        const reply = await createTestPost(actor, { content: "Reply", in_reply_to_id: parent.id });

        const res = await testRequest(api, "GET", `/posts/${reply.public_id}`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.ancestors);
        assertEquals(data.ancestors.length, 1);
      });
    });

    // ============ GET /posts/:id/replies ============
    await t.step("GET /posts/:id/replies", async (t) => {
      await t.step("returns replies to a post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Original post" });
        await createTestPost(actor, { content: "Reply 1", in_reply_to_id: post.id });
        await createTestPost(actor, { content: "Reply 2", in_reply_to_id: post.id });

        const res = await testRequest(api, "GET", `/posts/${post.public_id}/replies`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.replies);
        assertEquals(data.replies.length, 2);
      });

      await t.step("returns 404 for non-existent post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/posts/non-existent-uuid/replies");
        assertEquals(res.status, 404);
      });
    });

    // ============ DELETE /posts/:id ============
    await t.step("DELETE /posts/:id", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}`);
        assertEquals(res.status, 401);
      });

      await t.step("rejects deletion of others' posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Author's post" });

        const session = await loginUser(api, "other@test.com", "password123");

        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 404);
      });

      await t.step("deletes own post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "Delete me" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);

        // Verify post is actually deleted
        const getRes = await testRequest(api, "GET", `/posts/${post.public_id}`);
        assertEquals(getRes.status, 404);
      });
    });

    // ============ POST /posts/:id/like ============
    await t.step("POST /posts/:id/like", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/like`);
        assertEquals(res.status, 401);
      });

      await t.step("returns 404 for non-existent post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "user", email: "user@test.com", password: "password123" });
        const session = await loginUser(api, "user@test.com", "password123");

        const res = await testRequest(api, "POST", "/posts/non-existent-uuid/like", { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 404);
      });

      await t.step("likes a post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        await createTestUser({ username: "liker", email: "liker@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "Like me!" });

        const session = await loginUser(api, "liker@test.com", "password123");
        const res = await testRequest(api, "POST", `/posts/${post.public_id}/like`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });
    });

    // ============ DELETE /posts/:id/like ============
    await t.step("DELETE /posts/:id/like", async (t) => {
      await t.step("unlikes a post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: poster } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const { actor: liker } = await createTestUser({ username: "liker", email: "liker@test.com", password: "password123" });
        const post = await createTestPost(poster, { content: "Unlike me!" });

        // Like first
        await db.addLike(liker.id, post.id);

        const session = await loginUser(api, "liker@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}/like`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}/like`);
        assertEquals(res.status, 401);
      });
    });

    // ============ POST /posts/:id/boost ============
    await t.step("POST /posts/:id/boost", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/boost`);
        assertEquals(res.status, 401);
      });

      await t.step("rejects boosting own post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "My own post" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/boost`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Cannot boost your own post");
      });

      await t.step("boosts another user's post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "booster", email: "booster@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Boost me!" });

        const session = await loginUser(api, "booster@test.com", "password123");
        const res = await testRequest(api, "POST", `/posts/${post.public_id}/boost`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });
    });

    // ============ DELETE /posts/:id/boost ============
    await t.step("DELETE /posts/:id/boost", async (t) => {
      await t.step("unboosts a post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const { actor: booster } = await createTestUser({ username: "booster", email: "booster@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Unboost me!" });

        // Boost first
        await db.addBoost(booster.id, post.id);

        const session = await loginUser(api, "booster@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}/boost`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}/boost`);
        assertEquals(res.status, 401);
      });
    });

    // ============ POST /posts/:id/pin ============
    await t.step("POST /posts/:id/pin", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/pin`);
        assertEquals(res.status, 401);
      });

      await t.step("rejects pinning another user's post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Author's post" });
        const session = await loginUser(api, "other@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 403);
      });

      await t.step("pins own post successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "My post" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertEquals(data.pinned, true);
      });

      await t.step("rejects pinning more than 5 posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const session = await loginUser(api, "poster@test.com", "password123");

        // Pin 5 posts
        for (let i = 0; i < 5; i++) {
          const post = await createTestPost(actor, { content: `Post ${i}` });
          await testRequest(api, "POST", `/posts/${post.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });
        }

        // Try to pin a 6th
        const sixthPost = await createTestPost(actor, { content: "Post 6" });
        const res = await testRequest(api, "POST", `/posts/${sixthPost.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Cannot pin more than 5 posts");
      });
    });

    // ============ DELETE /posts/:id/pin ============
    await t.step("DELETE /posts/:id/pin", async (t) => {
      await t.step("unpins a pinned post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "My post" });
        const session = await loginUser(api, "poster@test.com", "password123");

        // Pin first
        await testRequest(api, "POST", `/posts/${post.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });

        // Then unpin
        const res = await testRequest(api, "DELETE", `/posts/${post.public_id}/pin`, { cookie: session.cookie, csrfToken: session.csrfToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertEquals(data.pinned, false);
      });
    });

    // ============ POST /posts/:id/report ============
    await t.step("POST /posts/:id/report", async (t) => {
      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com" });
        const post = await createTestPost(actor, { content: "Test post" });

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          body: { reason: "spam" },
        });
        assertEquals(res.status, 401);
      });

      await t.step("rejects invalid reason", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "reporter", email: "reporter@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Bad post" });
        const session = await loginUser(api, "reporter@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { reason: "invalid_reason" },
        });
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid reason");
      });

      await t.step("rejects reporting own post", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "poster", email: "poster@test.com", password: "password123" });
        const post = await createTestPost(actor, { content: "My post" });
        const session = await loginUser(api, "poster@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { reason: "spam" },
        });
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Cannot report your own post");
      });

      await t.step("accepts valid report", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "reporter", email: "reporter@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Spam post" });
        const session = await loginUser(api, "reporter@test.com", "password123");

        const res = await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { reason: "spam", details: "This is clearly spam" },
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects duplicate reports", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "reporter", email: "reporter@test.com", password: "password123" });
        const post = await createTestPost(author, { content: "Spam post" });
        const session = await loginUser(api, "reporter@test.com", "password123");

        // First report
        await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { reason: "spam" },
        });

        // Second report should fail
        const res = await testRequest(api, "POST", `/posts/${post.public_id}/report`, {
          cookie: session.cookie, csrfToken: session.csrfToken,
          body: { reason: "harassment" },
        });
        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "You have already reported this post");
      });
    });

    await closeTestDB();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
