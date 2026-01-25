/**
 * Community Routes Integration Tests
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  createTestApi,
  cleanDatabase,
  closeTestDB,
  createTestUser,
  createTestPost,
  createTestCommunity,
  testRequest,
  loginUser,
  getTestDB,
  getTestCommunityDB,
} from "./setup.ts";

Deno.test({
  name: "Community Routes Integration",
  async fn(t) {
    await cleanDatabase();

    // ============ GET /communities ============
    await t.step("GET /communities", async (t) => {
      await t.step("returns list of communities", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestCommunity(actor, { name: "testcommunity1" });
        await createTestCommunity(actor, { name: "testcommunity2" });

        const res = await testRequest(api, "GET", "/communities");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.communities);
        assertEquals(data.communities.length, 2);
      });

      await t.step("respects limit parameter", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        for (let i = 0; i < 10; i++) {
          await createTestCommunity(actor, { name: `community${i}` });
        }

        const res = await testRequest(api, "GET", "/communities?limit=5");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.communities.length, 5);
        assertExists(data.next_cursor);
      });
    });

    // ============ GET /communities/search ============
    await t.step("GET /communities/search", async (t) => {
      await t.step("returns matching communities", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestCommunity(actor, { name: "gaming" });
        await createTestCommunity(actor, { name: "coding" });

        const res = await testRequest(api, "GET", "/communities/search?q=gam");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.communities);
        assertEquals(data.communities.length, 1);
        assertEquals(data.communities[0].handle, "@gaming@test.local");
      });

      await t.step("returns empty array for no query", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/search");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.communities.length, 0);
      });
    });

    // ============ GET /communities/joined ============
    await t.step("GET /communities/joined", async (t) => {
      await t.step("returns joined communities for authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: creator } = await createTestUser({ username: "creator", email: "creator@test.com" });
        const { actor: member } = await createTestUser({ username: "member", email: "member@test.com", password: "password123" });

        const community = await createTestCommunity(creator, { name: "testcommunity" });
        await db.addFollow(member.id, community.id);

        const cookie = await loginUser(api, "member@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/joined", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.communities);
        assertEquals(data.communities.length, 1);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/joined");
        assertEquals(res.status, 401);
      });
    });

    // ============ GET /communities/trending ============
    await t.step("GET /communities/trending", async (t) => {
      await t.step("returns trending communities", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestCommunity(actor, { name: "trendingcommunity" });

        const res = await testRequest(api, "GET", "/communities/trending");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.communities);
      });
    });

    // ============ POST /communities ============
    await t.step("POST /communities", async (t) => {
      await t.step("creates community with valid data", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "POST", "/communities", {
          cookie,
          body: { name: "newcommunity", bio: "A test community" },
        });

        assertEquals(res.status, 201);
        const data = await res.json();
        assertExists(data.community);
        assertEquals(data.community.handle, "@newcommunity@test.local");
        assertEquals(data.community.bio, "A test community");
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "POST", "/communities", {
          body: { name: "testcommunity" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects missing name", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "POST", "/communities", {
          cookie,
          body: { bio: "No name provided" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Community name is required");
      });

      await t.step("rejects invalid name format", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "POST", "/communities", {
          cookie,
          body: { name: "Invalid Name!" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Invalid name (lowercase, numbers, underscore only, max 26 chars)");
      });

      await t.step("rejects name over 26 chars", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "POST", "/communities", {
          cookie,
          body: { name: "a".repeat(27) },
        });

        assertEquals(res.status, 400);
      });

      await t.step("rejects duplicate name", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "existingcommunity" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "POST", "/communities", {
          cookie,
          body: { name: "existingcommunity" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "Community name already taken");
      });
    });

    // ============ GET /communities/:name ============
    await t.step("GET /communities/:name", async (t) => {
      await t.step("returns community by name", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestCommunity(actor, { name: "testcommunity", bio: "Test bio" });

        const res = await testRequest(api, "GET", "/communities/testcommunity");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.community);
        assertEquals(data.community.handle, "@testcommunity@test.local");
        assertEquals(data.community.bio, "Test bio");
      });

      await t.step("returns 404 for non-existent community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/nonexistent");
        assertEquals(res.status, 404);
        const data = await res.json();
        assertEquals(data.error, "Community not found");
      });

      await t.step("includes moderation info for authenticated user", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "GET", "/communities/testcommunity", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.moderation);
        assertEquals(data.moderation.isAdmin, true);
        assertEquals(data.moderation.isOwner, true);
      });
    });

    // ============ PUT /communities/:name ============
    await t.step("PUT /communities/:name", async (t) => {
      await t.step("updates community as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "PUT", "/communities/testcommunity", {
          cookie,
          body: { bio: "Updated bio" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.community);
        assertEquals(data.community.bio, "Updated bio");
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const res = await testRequest(api, "PUT", "/communities/testcommunity", {
          body: { bio: "Updated bio" },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects non-admin updates", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "PUT", "/communities/testcommunity", {
          cookie,
          body: { bio: "Updated bio" },
        });

        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "Admin access required");
      });

      await t.step("returns 404 for non-existent community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "PUT", "/communities/nonexistent", {
          cookie,
          body: { bio: "Updated bio" },
        });

        assertEquals(res.status, 404);
      });
    });

    // ============ DELETE /communities/:name ============
    await t.step("DELETE /communities/:name", async (t) => {
      await t.step("deletes community as owner", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "creator", email: "creator@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });
        const cookie = await loginUser(api, "creator@test.com", "password123");

        const res = await testRequest(api, "DELETE", "/communities/testcommunity", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);

        // Verify deleted
        const getRes = await testRequest(api, "GET", "/communities/testcommunity");
        assertEquals(getRes.status, 404);
      });

      await t.step("rejects non-owner deletion", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: admin } = await createTestUser({ username: "admin", email: "admin@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        // Make admin an admin but not owner
        await communityDb.addCommunityAdmin(community.id, admin.id, "admin", owner.id);

        const cookie = await loginUser(api, "admin@test.com", "password123");
        const res = await testRequest(api, "DELETE", "/communities/testcommunity", { cookie });
        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "Owner access required");
      });
    });

    // ============ POST /communities/:name/join ============
    await t.step("POST /communities/:name/join", async (t) => {
      await t.step("joins community successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestUser({ username: "member", email: "member@test.com", password: "password123" });
        await createTestCommunity(owner, { name: "testcommunity" });

        const cookie = await loginUser(api, "member@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/join", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertEquals(data.is_member, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const res = await testRequest(api, "POST", "/communities/testcommunity/join");
        assertEquals(res.status, 401);
      });

      await t.step("rejects banned users", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: banned } = await createTestUser({ username: "banned", email: "banned@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.banActor(community.id, banned.id, "Spamming", owner.id);

        const cookie = await loginUser(api, "banned@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/join", { cookie });
        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "You are banned from this community");
      });
    });

    // ============ POST /communities/:name/leave ============
    await t.step("POST /communities/:name/leave", async (t) => {
      await t.step("leaves community successfully", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: member } = await createTestUser({ username: "member", email: "member@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await db.addFollow(member.id, community.id);

        const cookie = await loginUser(api, "member@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/leave", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
        assertEquals(data.is_member, false);
      });

      await t.step("prevents owner from leaving", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/leave", { cookie });
        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "Owners cannot leave. Transfer ownership first.");
      });
    });

    // ============ GET /communities/:name/members ============
    await t.step("GET /communities/:name/members", async (t) => {
      await t.step("returns member list", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: member } = await createTestUser({ username: "member", email: "member@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await db.addFollow(member.id, community.id);

        const res = await testRequest(api, "GET", "/communities/testcommunity/members");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.members);
        // Owner is auto-joined when creating community
        assertEquals(data.members.length >= 1, true);
      });

      await t.step("returns 404 for non-existent community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/nonexistent/members");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /communities/:name/admins ============
    await t.step("GET /communities/:name/admins", async (t) => {
      await t.step("returns admin list", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const res = await testRequest(api, "GET", "/communities/testcommunity/admins");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.admins);
        assertEquals(data.admins.length, 1);
        assertEquals(data.admins[0].role, "owner");
      });

      await t.step("returns 404 for non-existent community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/nonexistent/admins");
        assertEquals(res.status, 404);
      });
    });

    // ============ POST /communities/:name/admins ============
    await t.step("POST /communities/:name/admins", async (t) => {
      await t.step("adds admin as owner", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: newAdmin } = await createTestUser({ username: "newadmin", email: "newadmin@test.com" });
        await createTestCommunity(owner, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/admins", {
          cookie,
          body: { actor_id: newAdmin.public_id, role: "admin" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-owner adding admins", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: admin } = await createTestUser({ username: "admin", email: "admin@test.com", password: "password123" });
        const { actor: newAdmin } = await createTestUser({ username: "newadmin", email: "newadmin@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.addCommunityAdmin(community.id, admin.id, "admin", owner.id);

        const cookie = await loginUser(api, "admin@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/admins", {
          cookie,
          body: { actor_id: newAdmin.public_id, role: "admin" },
        });

        assertEquals(res.status, 403);
      });

      await t.step("rejects missing actor_id", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/admins", {
          cookie,
          body: { role: "admin" },
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "actor_id is required");
      });
    });

    // ============ DELETE /communities/:name/admins/:actorId ============
    await t.step("DELETE /communities/:name/admins/:actorId", async (t) => {
      await t.step("removes admin as owner", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: admin } = await createTestUser({ username: "admin", email: "admin@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.addCommunityAdmin(community.id, admin.id, "admin", owner.id);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/admins/${admin.public_id}`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-owner removing admins", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: admin1 } = await createTestUser({ username: "admin1", email: "admin1@test.com", password: "password123" });
        const { actor: admin2 } = await createTestUser({ username: "admin2", email: "admin2@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.addCommunityAdmin(community.id, admin1.id, "admin", owner.id);
        await communityDb.addCommunityAdmin(community.id, admin2.id, "admin", owner.id);

        const cookie = await loginUser(api, "admin1@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/admins/${admin2.public_id}`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ GET /communities/:name/bans ============
    await t.step("GET /communities/:name/bans", async (t) => {
      await t.step("returns ban list as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: banned } = await createTestUser({ username: "banned", email: "banned@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.banActor(community.id, banned.id, "Spamming", owner.id);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/bans", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.bans);
        assertEquals(data.bans.length, 1);
      });

      await t.step("rejects non-admin requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        await createTestCommunity(owner, { name: "testcommunity" });

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/bans", { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ POST /communities/:name/bans ============
    await t.step("POST /communities/:name/bans", async (t) => {
      await t.step("bans user as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: toBan } = await createTestUser({ username: "toban", email: "toban@test.com" });
        await createTestCommunity(owner, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/bans", {
          cookie,
          body: { actor_id: toBan.public_id, reason: "Spamming" },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin bans", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: toBan } = await createTestUser({ username: "toban", email: "toban@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        await createTestCommunity(owner, { name: "testcommunity" });

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/bans", {
          cookie,
          body: { actor_id: toBan.public_id, reason: "Spamming" },
        });

        assertEquals(res.status, 403);
      });
    });

    // ============ DELETE /communities/:name/bans/:actorId ============
    await t.step("DELETE /communities/:name/bans/:actorId", async (t) => {
      await t.step("unbans user as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: banned } = await createTestUser({ username: "banned", email: "banned@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.banActor(community.id, banned.id, "Spamming", owner.id);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/bans/${banned.public_id}`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin unbans", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: banned } = await createTestUser({ username: "banned", email: "banned@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        await communityDb.banActor(community.id, banned.id, "Spamming", owner.id);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/bans/${banned.public_id}`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ GET /communities/:name/posts ============
    await t.step("GET /communities/:name/posts", async (t) => {
      await t.step("returns community posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const post = await createTestPost(owner, { content: "Community post" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        // Add post to community
        await communityDb.submitCommunityPost(community.id, post.id, true);

        const res = await testRequest(api, "GET", "/communities/testcommunity/posts");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });

      await t.step("returns 404 for non-existent community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", "/communities/nonexistent/posts");
        assertEquals(res.status, 404);
      });
    });

    // ============ GET /communities/:name/posts/pinned ============
    await t.step("GET /communities/:name/posts/pinned", async (t) => {
      await t.step("returns pinned posts", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const res = await testRequest(api, "GET", "/communities/testcommunity/posts/pinned");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });
    });

    // ============ GET /communities/:name/posts/pending ============
    await t.step("GET /communities/:name/posts/pending", async (t) => {
      await t.step("returns pending posts for admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/posts/pending", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.posts);
      });

      await t.step("rejects non-admin requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/posts/pending", { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ POST /communities/:name/posts ============
    await t.step("POST /communities/:name/posts", async (t) => {
      await t.step("submits post to community", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        // Create a post first
        const post = await createTestPost(actor, { content: "Hello community!" });

        // Owner is auto-joined, so they should be able to submit
        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/posts", {
          cookie,
          body: { post_id: post.public_id },
        });

        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestCommunity(actor, { name: "testcommunity" });
        const post = await createTestPost(actor, { content: "Hello!" });

        const res = await testRequest(api, "POST", "/communities/testcommunity/posts", {
          body: { post_id: post.public_id },
        });

        assertEquals(res.status, 401);
      });

      await t.step("rejects missing post_id", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/posts", {
          cookie,
          body: {},
        });

        assertEquals(res.status, 400);
        const data = await res.json();
        assertEquals(data.error, "post_id is required");
      });

      await t.step("rejects non-members", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: nonmember } = await createTestUser({ username: "nonmember", email: "nonmember@test.com", password: "password123" });
        await createTestCommunity(owner, { name: "testcommunity" });

        // Create a post by the non-member
        const post = await createTestPost(nonmember, { content: "Hello!" });

        const cookie = await loginUser(api, "nonmember@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/posts", {
          cookie,
          body: { post_id: post.public_id },
        });

        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "You must join this community to post");
      });

      await t.step("rejects banned users", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();
        const db = await getTestDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: banned } = await createTestUser({ username: "banned", email: "banned@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        // Create a post by the banned user
        const post = await createTestPost(banned, { content: "Hello!" });

        // Join first then get banned
        await db.addFollow(banned.id, community.id);
        await communityDb.banActor(community.id, banned.id, "Spamming", owner.id);

        const cookie = await loginUser(api, "banned@test.com", "password123");
        const res = await testRequest(api, "POST", "/communities/testcommunity/posts", {
          cookie,
          body: { post_id: post.public_id },
        });

        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.error, "You are banned from this community");
      });
    });

    // ============ POST /communities/:name/suggest/:postId ============
    await t.step("POST /communities/:name/suggest/:postId", async (t) => {
      await t.step("suggests external post to community", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const db = await getTestDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const { actor: suggester } = await createTestUser({ username: "suggester", email: "suggester@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Great post!" });

        // Suggester needs to be a member
        await db.addFollow(suggester.id, community.id);

        const cookie = await loginUser(api, "suggester@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/suggest/${post.public_id}`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects unauthenticated requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Great post!" });

        const res = await testRequest(api, "POST", `/communities/testcommunity/suggest/${post.public_id}`);
        assertEquals(res.status, 401);
      });
    });

    // ============ POST /communities/:name/posts/:postId/approve ============
    await t.step("POST /communities/:name/posts/:postId/approve", async (t) => {
      await t.step("approves pending post as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pending post" });

        // Submit post as pending
        await communityDb.submitCommunityPost(community.id, post.id, false);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/approve`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin approval", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pending post" });

        await communityDb.submitCommunityPost(community.id, post.id, false);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/approve`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ POST /communities/:name/posts/:postId/reject ============
    await t.step("POST /communities/:name/posts/:postId/reject", async (t) => {
      await t.step("rejects pending post as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pending post" });

        await communityDb.submitCommunityPost(community.id, post.id, false);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/reject`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin rejection", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pending post" });

        await communityDb.submitCommunityPost(community.id, post.id, false);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/reject`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ POST /communities/:name/posts/:postId/unboost ============
    await t.step("POST /communities/:name/posts/:postId/unboost", async (t) => {
      await t.step("unboosts post from community as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Boosted post" });

        // Suggest post (creates announcement) and approve it
        await communityDb.suggestCommunityPost(community.id, post.id, owner.id);
        await communityDb.approvePost(community.id, post.id, owner.id, post.public_id);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/unboost`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin unboost", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Boosted post" });

        // Suggest post (creates announcement) and approve it
        await communityDb.suggestCommunityPost(community.id, post.id, owner.id);
        await communityDb.approvePost(community.id, post.id, owner.id, post.public_id);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/unboost`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ DELETE /communities/:name/posts/:postId ============
    await t.step("DELETE /communities/:name/posts/:postId", async (t) => {
      await t.step("deletes post from community as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "To be deleted" });

        await communityDb.submitCommunityPost(community.id, post.id, true);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/posts/${post.public_id}`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin deletion", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "To be deleted" });

        await communityDb.submitCommunityPost(community.id, post.id, true);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/posts/${post.public_id}`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ POST /communities/:name/posts/:postId/pin ============
    await t.step("POST /communities/:name/posts/:postId/pin", async (t) => {
      await t.step("pins post in community as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pin me!" });

        await communityDb.submitCommunityPost(community.id, post.id, true);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/pin`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin pin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Pin me!" });

        await communityDb.submitCommunityPost(community.id, post.id, true);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "POST", `/communities/testcommunity/posts/${post.public_id}/pin`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ DELETE /communities/:name/posts/:postId/pin ============
    await t.step("DELETE /communities/:name/posts/:postId/pin", async (t) => {
      await t.step("unpins post from community as admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Unpin me!" });

        await communityDb.submitCommunityPost(community.id, post.id, true);
        await communityDb.pinPost(community.id, post.id, owner.id);

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/posts/${post.public_id}/pin`, { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.ok, true);
      });

      await t.step("rejects non-admin unpin", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: author } = await createTestUser({ username: "author", email: "author@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });
        const post = await createTestPost(author, { content: "Unpin me!" });

        await communityDb.submitCommunityPost(community.id, post.id, true);
        await communityDb.pinPost(community.id, post.id, owner.id);

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "DELETE", `/communities/testcommunity/posts/${post.public_id}/pin`, { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ GET /communities/:name/mod-logs ============
    await t.step("GET /communities/:name/mod-logs", async (t) => {
      await t.step("returns mod logs for admin", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "owner@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/mod-logs", { cookie });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.logs);
      });

      await t.step("rejects non-admin requests", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "owner", email: "owner@test.com" });
        await createTestUser({ username: "other", email: "other@test.com", password: "password123" });
        await createTestCommunity(actor, { name: "testcommunity" });

        const cookie = await loginUser(api, "other@test.com", "password123");
        const res = await testRequest(api, "GET", "/communities/testcommunity/mod-logs", { cookie });
        assertEquals(res.status, 403);
      });
    });

    // ============ Community Replies Behavior ============
    await t.step("Community replies behavior", async (t) => {
      await t.step("replies to community posts should NOT be added to community_posts table", async () => {
        await cleanDatabase();
        const communityDb = await getTestCommunityDB();

        // Create community with require_approval enabled
        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: remoteUser } = await createTestUser({ username: "remoteuser", email: "remote@test.com" });
        const community = await createTestCommunity(owner, { name: "moderated", require_approval: true });

        // Create a parent post that's approved in the community
        const parentPost = await createTestPost(owner, { content: "Original post" });
        await communityDb.submitCommunityPost(community.id, parentPost.id, true);

        // Create a reply to the parent post (this is just a regular reply, NOT a community post)
        const reply = await createTestPost(remoteUser, {
          content: "Reply to original",
          in_reply_to_id: parentPost.id
        });

        // Replies should NOT be in community_posts - they're just replies
        const replyStatus = await communityDb.getCommunityPostStatus(community.id, reply.id);
        assertEquals(replyStatus, null); // Reply is not in community_posts
      });

      await t.step("new top-level posts from non-admins should go to pending when approval required", async () => {
        await cleanDatabase();
        const communityDb = await getTestCommunityDB();

        // Create community with require_approval enabled
        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com" });
        const { actor: regularUser } = await createTestUser({ username: "regular", email: "regular@test.com" });
        const community = await createTestCommunity(owner, { name: "moderated", require_approval: true });

        // Create a new post from a non-admin
        const newPost = await createTestPost(regularUser, { content: "New post" });

        // Submit with autoApprove=false (non-admin in moderated community)
        await communityDb.submitCommunityPost(community.id, newPost.id, false);

        // Verify the post is pending
        const postStatus = await communityDb.getCommunityPostStatus(community.id, newPost.id);
        assertExists(postStatus);
        assertEquals(postStatus.status, "pending");
      });

      await t.step("only top-level posts appear in community feed, not replies", async () => {
        await cleanDatabase();
        const api = await createTestApi();
        const communityDb = await getTestCommunityDB();

        // Create community
        const { actor: owner } = await createTestUser({ username: "owner", email: "owner@test.com", password: "password123" });
        const { actor: otherUser } = await createTestUser({ username: "other", email: "other@test.com" });
        const community = await createTestCommunity(owner, { name: "testcommunity" });

        // Create and approve a parent post
        const parentPost = await createTestPost(owner, { content: "Original post" });
        await communityDb.submitCommunityPost(community.id, parentPost.id, true);

        // Create a reply (NOT added to community_posts)
        await createTestPost(otherUser, {
          content: "Reply content",
          in_reply_to_id: parentPost.id
        });

        // Check community feed - only the parent post should be there
        const res = await testRequest(api, "GET", "/communities/testcommunity/posts");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 1);
        assertEquals(data.posts[0].content, "<p>Original post</p>");
      });
    });

    await closeTestDB();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
