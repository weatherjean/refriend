/**
 * Feeds Integration Tests
 *
 * Tests for user-moderated curated feeds: CRUD, moderation,
 * suggestions, bookmarks, search, and authorization.
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  cleanDatabase,
  createTestUser,
  createTestPost,
  createTestApi,
  loginUser,
  testRequest,
} from "./setup.ts";

Deno.test({
  name: "Feeds Integration",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await cleanDatabase();

    // ============ Feed CRUD ============
    await t.step("Feed CRUD", async (t) => {
      await t.step("create feed with valid data", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "feedowner", email: "feedowner@test.local", password: "password123" });
        const session = await loginUser(api, "feedowner@test.local", "password123");

        const res = await testRequest(api, "POST", "/feeds", {
          body: { name: "My Feed", slug: "my-feed", description: "A test feed" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 201);
        const data = await res.json();
        assertEquals(data.feed.name, "My Feed");
        assertEquals(data.feed.slug, "my-feed");
        assertEquals(data.feed.description, "A test feed");
      });

      await t.step("rejects duplicate slug", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "dupowner", email: "dupowner@test.local", password: "password123" });
        const session = await loginUser(api, "dupowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Feed A", slug: "same-slug" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "POST", "/feeds", {
          body: { name: "Feed B", slug: "same-slug" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 409);
      });

      await t.step("rejects invalid slug", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "slugtest", email: "slugtest@test.local", password: "password123" });
        const session = await loginUser(api, "slugtest@test.local", "password123");

        const res = await testRequest(api, "POST", "/feeds", {
          body: { name: "Bad Slug", slug: "HAS SPACES!" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 400);
      });

      await t.step("requires authentication to create", async () => {
        const api = await createTestApi();
        const res = await testRequest(api, "POST", "/feeds", {
          body: { name: "No Auth", slug: "no-auth" },
        });
        assertEquals(res.status, 401);
      });

      await t.step("get feed by slug", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "getowner", email: "getowner@test.local", password: "password123" });
        const session = await loginUser(api, "getowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Get Me", slug: "get-me" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/get-me", {
          cookie: session.cookie,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feed.name, "Get Me");
        assertEquals(data.is_owner, true);
      });

      await t.step("update feed (owner only)", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "updater", email: "updater@test.local", password: "password123" });
        const session = await loginUser(api, "updater@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Original", slug: "update-me" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "PUT", "/feeds/update-me", {
          body: { name: "Updated", description: "New desc" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feed.name, "Updated");
        assertEquals(data.feed.description, "New desc");
      });

      await t.step("non-owner cannot update feed", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "realowner", email: "realowner@test.local", password: "password123" });
        await createTestUser({ username: "intruder", email: "intruder@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "realowner@test.local", "password123");
        const intruderSession = await loginUser(api, "intruder@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Owner Only", slug: "owner-only" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        const res = await testRequest(api, "PUT", "/feeds/owner-only", {
          body: { name: "Hacked" },
          cookie: intruderSession.cookie,
          csrfToken: intruderSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("delete feed (owner only)", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "deleter", email: "deleter@test.local", password: "password123" });
        const session = await loginUser(api, "deleter@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Delete Me", slug: "delete-me" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "DELETE", "/feeds/delete-me", {
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 200);

        const getRes = await testRequest(api, "GET", "/feeds/delete-me");
        assertEquals(getRes.status, 404);
      });
    });

    // ============ Feed Posts ============
    await t.step("Feed Posts", async (t) => {
      await t.step("moderator can add and remove posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const { actor } = await createTestUser({ username: "postmod", email: "postmod@test.local", password: "password123" });
        const session = await loginUser(api, "postmod@test.local", "password123");
        const post = await createTestPost(actor, { content: "Feed content" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Post Feed", slug: "post-feed" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        // Add post
        const addRes = await testRequest(api, "POST", "/feeds/post-feed/posts", {
          body: { post_id: post.public_id },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(addRes.status, 200);

        // Verify post appears
        const listRes = await testRequest(api, "GET", "/feeds/post-feed/posts");
        assertEquals(listRes.status, 200);
        const listData = await listRes.json();
        assertEquals(listData.posts.length, 1);

        // Remove post
        const removeRes = await testRequest(api, "DELETE", `/feeds/post-feed/posts/${post.public_id}`, {
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(removeRes.status, 200);

        // Verify removed
        const afterRes = await testRequest(api, "GET", "/feeds/post-feed/posts");
        const afterData = await afterRes.json();
        assertEquals(afterData.posts.length, 0);
      });

      await t.step("non-moderator cannot add posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "feedowner2", email: "feedowner2@test.local", password: "password123" });
        const { actor: randoActor } = await createTestUser({ username: "rando", email: "rando@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "feedowner2@test.local", "password123");
        const randoSession = await loginUser(api, "rando@test.local", "password123");
        const post = await createTestPost(randoActor, { content: "Not allowed" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Locked", slug: "locked" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        const res = await testRequest(api, "POST", "/feeds/locked/posts", {
          body: { post_id: post.public_id },
          cookie: randoSession.cookie,
          csrfToken: randoSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });
    });

    // ============ Moderators ============
    await t.step("Moderators", async (t) => {
      await t.step("owner can add and remove moderators", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "modowner", email: "modowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "newmod", email: "newmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "modowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Mod Feed", slug: "mod-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Add moderator
        const addRes = await testRequest(api, "POST", "/feeds/mod-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        assertEquals(addRes.status, 200);

        // Verify moderator appears
        const listRes = await testRequest(api, "GET", "/feeds/mod-feed/moderators");
        const listData = await listRes.json();
        assertEquals(listData.moderators.length, 1);
        assertEquals(listData.moderators[0].handle, modActor.handle);

        // Remove moderator
        const removeRes = await testRequest(api, "DELETE", `/feeds/mod-feed/moderators/${modActor.public_id}`, {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        assertEquals(removeRes.status, 200);

        const afterRes = await testRequest(api, "GET", "/feeds/mod-feed/moderators");
        const afterData = await afterRes.json();
        assertEquals(afterData.moderators.length, 0);
      });

      await t.step("non-owner cannot add moderators", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "modowner2", email: "modowner2@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "wannamod", email: "wannamod@test.local", password: "password123" });
        const { actor: targetActor } = await createTestUser({ username: "target", email: "target@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "modowner2@test.local", "password123");
        const modSession = await loginUser(api, "wannamod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Mod Feed 2", slug: "mod-feed-2" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Add wannamod as moderator
        await testRequest(api, "POST", "/feeds/mod-feed-2/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Moderator tries to add another moderator — should fail
        const res = await testRequest(api, "POST", "/feeds/mod-feed-2/moderators", {
          body: { actor_id: targetActor.public_id },
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("moderator can self-remove", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "selfowner", email: "selfowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "selfmod", email: "selfmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "selfowner@test.local", "password123");
        const modSession = await loginUser(api, "selfmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Self Feed", slug: "self-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/self-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Moderator removes themselves
        const res = await testRequest(api, "DELETE", `/feeds/self-feed/moderators/${modActor.public_id}`, {
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });
        assertEquals(res.status, 200);
      });

      await t.step("moderator cannot remove other moderators", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "crossowner", email: "crossowner@test.local", password: "password123" });
        const { actor: mod1 } = await createTestUser({ username: "mod1", email: "mod1@test.local", password: "password123" });
        const { actor: mod2 } = await createTestUser({ username: "mod2", email: "mod2@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "crossowner@test.local", "password123");
        const mod1Session = await loginUser(api, "mod1@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Cross Feed", slug: "cross-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/cross-feed/moderators", {
          body: { actor_id: mod1.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        await testRequest(api, "POST", "/feeds/cross-feed/moderators", {
          body: { actor_id: mod2.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // mod1 tries to remove mod2 — should fail
        const res = await testRequest(api, "DELETE", `/feeds/cross-feed/moderators/${mod2.public_id}`, {
          cookie: mod1Session.cookie,
          csrfToken: mod1Session.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("moderator can add posts to feed", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "modpostowner", email: "modpostowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "modposter", email: "modposter@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "modpostowner@test.local", "password123");
        const modSession = await loginUser(api, "modposter@test.local", "password123");
        const post = await createTestPost(modActor, { content: "Mod post" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Mod Post Feed", slug: "mod-post-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/mod-post-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        const res = await testRequest(api, "POST", "/feeds/mod-post-feed/posts", {
          body: { post_id: post.public_id },
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });
        assertEquals(res.status, 200);
      });
    });

    // ============ Suggestions ============
    await t.step("Suggestions", async (t) => {
      await t.step("bookmarked user can suggest, mod can approve", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "sugowner", email: "sugowner@test.local", password: "password123" });
        const { actor: userActor } = await createTestUser({ username: "suggester", email: "suggester@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "sugowner@test.local", "password123");
        const userSession = await loginUser(api, "suggester@test.local", "password123");
        const post = await createTestPost(userActor, { content: "Suggest me" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Suggestion Feed", slug: "sug-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Bookmark the feed as user
        await testRequest(api, "POST", "/feeds/sug-feed/bookmark", {
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });

        // Suggest a post
        const sugRes = await testRequest(api, "POST", "/feeds/sug-feed/suggest", {
          body: { post_id: post.public_id },
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });
        assertEquals(sugRes.status, 200);

        // Owner sees suggestion
        const listRes = await testRequest(api, "GET", "/feeds/sug-feed/suggestions", {
          cookie: ownerSession.cookie,
        });
        assertEquals(listRes.status, 200);
        const listData = await listRes.json();
        assertEquals(listData.suggestions.length, 1);
        assertExists(listData.suggestions[0].post);
        const suggestionId = listData.suggestions[0].id;

        // Approve suggestion
        const approveRes = await testRequest(api, "POST", `/feeds/sug-feed/suggestions/${suggestionId}/approve`, {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        assertEquals(approveRes.status, 200);

        // Post should now be in the feed
        const postsRes = await testRequest(api, "GET", "/feeds/sug-feed/posts");
        const postsData = await postsRes.json();
        assertEquals(postsData.posts.length, 1);
      });

      await t.step("non-bookmarked user cannot suggest", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "sugowner2", email: "sugowner2@test.local", password: "password123" });
        const { actor: randoActor } = await createTestUser({ username: "nosuggest", email: "nosuggest@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "sugowner2@test.local", "password123");
        const randoSession = await loginUser(api, "nosuggest@test.local", "password123");
        const post = await createTestPost(randoActor, { content: "Can't suggest" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "No Suggest Feed", slug: "no-sug-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        const res = await testRequest(api, "POST", "/feeds/no-sug-feed/suggest", {
          body: { post_id: post.public_id },
          cookie: randoSession.cookie,
          csrfToken: randoSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("mod can reject suggestion", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "rejowner", email: "rejowner@test.local", password: "password123" });
        const { actor: userActor } = await createTestUser({ username: "rejuser", email: "rejuser@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "rejowner@test.local", "password123");
        const userSession = await loginUser(api, "rejuser@test.local", "password123");
        const post = await createTestPost(userActor, { content: "Reject me" });

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Reject Feed", slug: "rej-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/rej-feed/bookmark", {
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/rej-feed/suggest", {
          body: { post_id: post.public_id },
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });

        const listRes = await testRequest(api, "GET", "/feeds/rej-feed/suggestions", {
          cookie: ownerSession.cookie,
        });
        const listData = await listRes.json();
        const suggestionId = listData.suggestions[0].id;

        const rejectRes = await testRequest(api, "POST", `/feeds/rej-feed/suggestions/${suggestionId}/reject`, {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        assertEquals(rejectRes.status, 200);

        // Suggestion should be gone from pending list
        const afterRes = await testRequest(api, "GET", "/feeds/rej-feed/suggestions", {
          cookie: ownerSession.cookie,
        });
        const afterData = await afterRes.json();
        assertEquals(afterData.suggestions.length, 0);

        // Post should NOT be in the feed
        const postsRes = await testRequest(api, "GET", "/feeds/rej-feed/posts");
        const postsData = await postsRes.json();
        assertEquals(postsData.posts.length, 0);
      });
    });

    // ============ Bookmarks ============
    await t.step("Bookmarks", async (t) => {
      await t.step("bookmark and unbookmark a feed", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "bkowner", email: "bkowner@test.local", password: "password123" });
        await createTestUser({ username: "bkuser", email: "bkuser@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "bkowner@test.local", "password123");
        const userSession = await loginUser(api, "bkuser@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "BK Feed", slug: "bk-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Bookmark
        const bkRes = await testRequest(api, "POST", "/feeds/bk-feed/bookmark", {
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });
        assertEquals(bkRes.status, 200);

        // Verify bookmarked
        const getRes = await testRequest(api, "GET", "/feeds/bk-feed", {
          cookie: userSession.cookie,
        });
        const getData = await getRes.json();
        assertEquals(getData.bookmarked, true);

        // Unbookmark
        const ubRes = await testRequest(api, "DELETE", "/feeds/bk-feed/bookmark", {
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });
        assertEquals(ubRes.status, 200);

        // Verify unbookmarked
        const afterRes = await testRequest(api, "GET", "/feeds/bk-feed", {
          cookie: userSession.cookie,
        });
        const afterData = await afterRes.json();
        assertEquals(afterData.bookmarked, false);
      });

      await t.step("owner cannot unbookmark own feed", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "noubowner", email: "noubowner@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "noubowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "No UB Feed", slug: "no-ub-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Bookmark first
        await testRequest(api, "POST", "/feeds/no-ub-feed/bookmark", {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Try unbookmark — should fail
        const res = await testRequest(api, "DELETE", "/feeds/no-ub-feed/bookmark", {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("moderator cannot unbookmark feed", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "noubowner2", email: "noubowner2@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "noubmod", email: "noubmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "noubowner2@test.local", "password123");
        const modSession = await loginUser(api, "noubmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "No UB Feed 2", slug: "no-ub-feed-2" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/no-ub-feed-2/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/no-ub-feed-2/bookmark", {
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });

        const res = await testRequest(api, "DELETE", "/feeds/no-ub-feed-2/bookmark", {
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });
        assertEquals(res.status, 403);
      });

      await t.step("bookmarked feeds appear in list", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        // Owner creates feeds (auto-bookmarked), separate user bookmarks one
        await createTestUser({ username: "listowner", email: "listowner@test.local", password: "password123" });
        await createTestUser({ username: "listuser", email: "listuser@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "listowner@test.local", "password123");
        const userSession = await loginUser(api, "listuser@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Feed Alpha", slug: "alpha" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });
        await testRequest(api, "POST", "/feeds", {
          body: { name: "Feed Beta", slug: "beta" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // User bookmarks only alpha
        await testRequest(api, "POST", "/feeds/alpha/bookmark", {
          cookie: userSession.cookie,
          csrfToken: userSession.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/bookmarks", {
          cookie: userSession.cookie,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feeds.length, 1);
        assertEquals(data.feeds[0].slug, "alpha");
      });
    });

    // ============ Search & Discovery ============
    await t.step("Search & Discovery", async (t) => {
      await t.step("search finds feeds by name", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "searchowner", email: "searchowner@test.local", password: "password123" });
        const session = await loginUser(api, "searchowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Unique Quantum Feed", slug: "quantum-feed" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/search?q=quantum");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feeds.length, 1);
        assertEquals(data.feeds[0].slug, "quantum-feed");
      });

      await t.step("search finds feeds by description", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "descowner", email: "descowner@test.local", password: "password123" });
        const session = await loginUser(api, "descowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Normal Name", slug: "desc-feed", description: "A feed about xylophone music" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/search?q=xylophone");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feeds.length, 1);
        assertEquals(data.feeds[0].slug, "desc-feed");
      });

      await t.step("search escapes LIKE wildcards", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "likeowner", email: "likeowner@test.local", password: "password123" });
        const session = await loginUser(api, "likeowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "100% Organic", slug: "organic" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        await testRequest(api, "POST", "/feeds", {
          body: { name: "100 Things", slug: "hundred" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        // Searching "100%" should only match "100% Organic", not "100 Things"
        const res = await testRequest(api, "GET", "/feeds/search?q=100%25");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.feeds.length, 1);
        assertEquals(data.feeds[0].slug, "organic");
      });

      await t.step("discover returns feeds", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "discowner", email: "discowner@test.local", password: "password123" });
        const session = await loginUser(api, "discowner@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Discoverable", slug: "discoverable" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/discover");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.trending);
        assertExists(data.popular);
        assertEquals(data.popular.length, 1);
      });

      await t.step("moderated feeds endpoint returns owned/moderated feeds", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "modlistowner", email: "modlistowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "modlistmod", email: "modlistmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "modlistowner@test.local", "password123");
        const modSession = await loginUser(api, "modlistmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Owned Feed", slug: "owned-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/owned-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Owner sees it
        const ownerRes = await testRequest(api, "GET", "/feeds/moderated", {
          cookie: ownerSession.cookie,
        });
        const ownerData = await ownerRes.json();
        assertEquals(ownerData.feeds.length, 1);

        // Moderator also sees it
        const modRes = await testRequest(api, "GET", "/feeds/moderated", {
          cookie: modSession.cookie,
        });
        const modData = await modRes.json();
        assertEquals(modData.feeds.length, 1);
      });
    });

    // ============ Moderator Notifications & Owner Display ============
    await t.step("Moderator Notifications & Owner", async (t) => {
      await t.step("adding a moderator creates feed_mod notification", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "notifowner", email: "notifowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "notifmod", email: "notifmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "notifowner@test.local", "password123");
        const modSession = await loginUser(api, "notifmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Notif Feed", slug: "notif-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/notif-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Mod should have a feed_mod notification
        const res = await testRequest(api, "GET", "/notifications", {
          cookie: modSession.cookie,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        const feedModNotif = data.notifications.find((n: { type: string }) => n.type === "feed_mod");
        assertExists(feedModNotif);
        assertEquals(feedModNotif.feed.slug, "notif-feed");
        assertEquals(feedModNotif.feed.name, "Notif Feed");
      });

      await t.step("removing a moderator creates feed_unmod notification", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "unmodowner", email: "unmodowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "unmodmod", email: "unmodmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "unmodowner@test.local", "password123");
        const modSession = await loginUser(api, "unmodmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Unmod Feed", slug: "unmod-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/unmod-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Remove moderator
        await testRequest(api, "DELETE", `/feeds/unmod-feed/moderators/${modActor.public_id}`, {
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Mod should have a feed_unmod notification
        const res = await testRequest(api, "GET", "/notifications", {
          cookie: modSession.cookie,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        const feedUnmodNotif = data.notifications.find((n: { type: string }) => n.type === "feed_unmod");
        assertExists(feedUnmodNotif);
        assertEquals(feedUnmodNotif.feed.slug, "unmod-feed");
      });

      await t.step("self-removal does not create feed_unmod notification", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "selfnotifowner", email: "selfnotifowner@test.local", password: "password123" });
        const { actor: modActor } = await createTestUser({ username: "selfnotifmod", email: "selfnotifmod@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "selfnotifowner@test.local", "password123");
        const modSession = await loginUser(api, "selfnotifmod@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Self Notif Feed", slug: "self-notif-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        await testRequest(api, "POST", "/feeds/self-notif-feed/moderators", {
          body: { actor_id: modActor.public_id },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        // Mod removes themselves
        await testRequest(api, "DELETE", `/feeds/self-notif-feed/moderators/${modActor.public_id}`, {
          cookie: modSession.cookie,
          csrfToken: modSession.csrfToken,
        });

        // Mod should have feed_mod (from add) but NOT feed_unmod
        const res = await testRequest(api, "GET", "/notifications", {
          cookie: modSession.cookie,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        const feedUnmodNotif = data.notifications.find((n: { type: string }) => n.type === "feed_unmod");
        assertEquals(feedUnmodNotif, undefined);
      });

      await t.step("moderators endpoint returns owner info", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        await createTestUser({ username: "ownerinfo", email: "ownerinfo@test.local", password: "password123" });
        const ownerSession = await loginUser(api, "ownerinfo@test.local", "password123");

        await testRequest(api, "POST", "/feeds", {
          body: { name: "Owner Info Feed", slug: "owner-info-feed" },
          cookie: ownerSession.cookie,
          csrfToken: ownerSession.csrfToken,
        });

        const res = await testRequest(api, "GET", "/feeds/owner-info-feed/moderators");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.owner);
        assertExists(data.owner.handle);
        assertExists(data.owner.public_id);
      });
    });
  },
});
