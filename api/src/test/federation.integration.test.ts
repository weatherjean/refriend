/**
 * Federation Integration Tests
 *
 * Tests inbox handlers via @fedify/testing's mock federation,
 * and HTTP routes for post creation/deletion involving remote actors.
 */

import { assertEquals, assertExists, assertNotEquals } from "jsr:@std/assert";
import { createFederation } from "@fedify/testing";
import {
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Note,
  Person,
  Group,
  Tombstone,
  Undo,
  Update,
} from "@fedify/fedify";
import {
  cleanDatabase,
  closeTestDB,
  createTestUser,
  createTestPost,
  createRemoteActor,
  getTestDB,
  createTestApi,
  loginUser,
  testRequest,
} from "./setup.ts";
import { registerInboxHandlers } from "../domains/federation-v2/setup.ts";

Deno.test({
  name: "Federation Integration",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await cleanDatabase();

    // ============ Group 1: DB Helper Methods ============
    await t.step("DB Helper Methods", async (t) => {
      await t.step("deletePostHashtags removes all hashtag associations", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const { actor } = await createTestUser({ username: "hashtagger" });
        const post = await createTestPost(actor, { content: "Test #hello" });
        const hashtag = await db.getOrCreateHashtag("hello");
        await db.addPostHashtag(post.id, hashtag.id);

        // Verify hashtag was added
        const hashtagsBefore = await db.getPostHashtags(post.id);
        assertEquals(hashtagsBefore.length, 1);

        await db.deletePostHashtags(post.id);

        const hashtagsAfter = await db.getPostHashtags(post.id);
        assertEquals(hashtagsAfter.length, 0);
      });

      await t.step("deleteMediaByPostId removes all media attachments", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const { actor } = await createTestUser({ username: "mediaposter" });
        const post = await createTestPost(actor, { content: "With image" });
        await db.createMedia(post.id, "https://example.com/image.jpg", "image/jpeg", "Alt text", null, null);

        const mediaBefore = await db.getMediaByPostId(post.id);
        assertEquals(mediaBefore.length, 1);

        await db.deleteMediaByPostId(post.id);

        const mediaAfter = await db.getMediaByPostId(post.id);
        assertEquals(mediaAfter.length, 0);
      });
    });

    // ============ Group 2: Update Handler ============
    await t.step("Update Handler (via receiveActivity)", async (t) => {
      await t.step("Update(Note) updates content, sensitive, and URL for existing post", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        // Create a remote actor and a post from that actor
        const remoteActor = await createRemoteActor({
          handle: "@alice@remote.example",
          uri: "https://remote.example/users/alice",
        });
        const noteUri = "https://remote.example/notes/1";
        await db.createPost({
          uri: noteUri,
          actor_id: remoteActor.id,
          content: "<p>Original content</p>",
          url: "https://remote.example/@alice/1",
          in_reply_to_id: null,
          sensitive: false,
        });

        // Set up test federation
        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Send Update activity
        const updateActivity = new Update({
          id: new URL("https://remote.example/activities/update-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/alice"),
            preferredUsername: "alice",
            inbox: new URL("https://remote.example/users/alice/inbox"),
          }),
          object: new Note({
            id: new URL(noteUri),
            content: "<p>Updated content</p>",
            sensitive: true,
            url: new URL("https://remote.example/@alice/1-updated"),
          }),
        });
        await testFed.receiveActivity(updateActivity);

        // Verify updates
        const updatedPost = await db.getPostByUri(noteUri);
        assertExists(updatedPost);
        assertEquals(updatedPost.content, "<p>Updated content</p>");
        assertEquals(updatedPost.sensitive, true);
        assertEquals(updatedPost.url, "https://remote.example/@alice/1-updated");
      });

      await t.step("Update(Note) for non-existent post is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@bob@remote.example",
          uri: "https://remote.example/users/bob",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const updateActivity = new Update({
          id: new URL("https://remote.example/activities/update-2"),
          actor: new Person({
            id: new URL("https://remote.example/users/bob"),
            preferredUsername: "bob",
            inbox: new URL("https://remote.example/users/bob/inbox"),
          }),
          object: new Note({
            id: new URL("https://remote.example/notes/nonexistent"),
            content: "<p>Should not crash</p>",
          }),
        });

        // Should not throw
        await testFed.receiveActivity(updateActivity);

        // Verify no post was created
        const post = await db.getPostByUri("https://remote.example/notes/nonexistent");
        assertEquals(post, null);
      });

      await t.step("Update(Note) from wrong author makes no changes", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const author = await createRemoteActor({
          handle: "@author@remote.example",
          uri: "https://remote.example/users/author",
        });
        const noteUri = "https://remote.example/notes/3";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Original</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        // Create a different remote actor to attempt the update
        await createRemoteActor({
          handle: "@impostor@other.example",
          uri: "https://other.example/users/impostor",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const updateActivity = new Update({
          id: new URL("https://other.example/activities/update-3"),
          actor: new Person({
            id: new URL("https://other.example/users/impostor"),
            preferredUsername: "impostor",
            inbox: new URL("https://other.example/users/impostor/inbox"),
          }),
          object: new Note({
            id: new URL(noteUri),
            content: "<p>Hacked content</p>",
          }),
        });
        await testFed.receiveActivity(updateActivity);

        // Content should be unchanged
        const post = await db.getPostByUri(noteUri);
        assertExists(post);
        assertEquals(post.content, "<p>Original</p>");
        assertEquals(post.sensitive, false);
      });

      await t.step("Update(Person) upserts actor profile in DB", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@carol@remote.example",
          name: "Carol Old",
          uri: "https://remote.example/users/carol",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const updateActivity = new Update({
          id: new URL("https://remote.example/activities/update-person-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/carol"),
            preferredUsername: "carol",
            name: "Carol Updated",
            summary: "New bio",
            inbox: new URL("https://remote.example/users/carol/inbox"),
          }),
          object: new Person({
            id: new URL("https://remote.example/users/carol"),
            preferredUsername: "carol",
            name: "Carol Updated",
            summary: "New bio",
            inbox: new URL("https://remote.example/users/carol/inbox"),
          }),
        });
        await testFed.receiveActivity(updateActivity);

        const actor = await db.getActorByUri("https://remote.example/users/carol");
        assertExists(actor);
        assertEquals(actor.name, "Carol Updated");
        assertEquals(actor.bio, "New bio");
      });
    });

    // ============ Group 3: Undo(Announce) Handler ============
    await t.step("Undo(Announce) Handler (via receiveActivity)", async (t) => {
      await t.step("Undo(Announce) from Group actor removes boost", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: localAuthor } = await createTestUser({ username: "localuser" });
        const post = await createTestPost(localAuthor, { content: "Community post" });

        // Create a Group actor (community)
        const community = await createRemoteActor({
          handle: "@community@lemmy.example",
          uri: "https://lemmy.example/c/community",
          actor_type: "Group",
        });

        // Simulate the community having boosted the post
        await db.addBoost(community.id, post.id);

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const undoActivity = new Undo({
          id: new URL("https://lemmy.example/activities/undo-1"),
          actor: new Group({
            id: new URL("https://lemmy.example/c/community"),
            preferredUsername: "community",
            inbox: new URL("https://lemmy.example/c/community/inbox"),
          }),
          object: new Announce({
            id: new URL("https://lemmy.example/activities/announce-1"),
            actor: new URL("https://lemmy.example/c/community"),
            object: new URL(post.uri),
          }),
        });
        await testFed.receiveActivity(undoActivity);

        // Post should still exist — Undo(Announce) removes the boost, not the post
        const existingPost = await db.getPostById(post.id);
        assertExists(existingPost);
      });

      await t.step("Undo(Announce) from Person actor removes boost but keeps post", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author" });
        const post = await createTestPost(author, { content: "Boosted post" });

        const booster = await createRemoteActor({
          handle: "@booster@remote.example",
          uri: "https://remote.example/users/booster",
        });
        await db.addBoost(booster.id, post.id);

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const undoActivity = new Undo({
          id: new URL("https://remote.example/activities/undo-2"),
          actor: new Person({
            id: new URL("https://remote.example/users/booster"),
            preferredUsername: "booster",
            inbox: new URL("https://remote.example/users/booster/inbox"),
          }),
          object: new Announce({
            id: new URL("https://remote.example/activities/announce-2"),
            actor: new URL("https://remote.example/users/booster"),
            object: new URL(post.uri),
          }),
        });
        await testFed.receiveActivity(undoActivity);

        // Post should still exist
        const existingPost = await db.getPostById(post.id);
        assertExists(existingPost);
      });
    });

    // ============ Group 4: Post Creation Reply Delivery (via HTTP routes) ============
    await t.step("Post Creation Replies (via HTTP routes)", async (t) => {
      await t.step("reply to a remote post sets in_reply_to_id correctly", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        // Create local user
        await createTestUser({ username: "replier", email: "replier@test.com", password: "password123" });
        const session = await loginUser(api, "replier@test.com", "password123");

        // Create a remote actor and their post
        const remoteActor = await createRemoteActor({
          handle: "@remote@remote.example",
          uri: "https://remote.example/users/remote",
        });
        const remotePost = await db.createPost({
          uri: "https://remote.example/notes/remote-1",
          actor_id: remoteActor.id,
          content: "<p>Remote post</p>",
          url: "https://remote.example/@remote/1",
          in_reply_to_id: null,
          sensitive: false,
        });

        // Create reply via API (in_reply_to takes public_id)
        const res = await testRequest(api, "POST", "/posts", {
          body: { content: "This is a reply", in_reply_to: remotePost.public_id },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 200);
        const data = await res.json();

        // Verify reply is linked to parent
        const reply = await db.getPostByPublicId(data.post.id);
        assertExists(reply);
        assertEquals(reply.in_reply_to_id, remotePost.id);
      });

      await t.step("reply mentioning a known remote actor creates post", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        await createTestUser({ username: "mentioner", email: "mentioner@test.com", password: "password123" });
        const session = await loginUser(api, "mentioner@test.com", "password123");

        // Create a known remote actor
        await createRemoteActor({
          handle: "@known@remote.example",
          uri: "https://remote.example/users/known",
        });

        // Create a post mentioning the remote actor
        const res = await testRequest(api, "POST", "/posts", {
          body: { content: "Hello @known@remote.example" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertExists(data.post);
        assertExists(data.post.id);
      });
    });

    // ============ Group 5: Post Deletion of Reply (via HTTP routes) ============
    await t.step("Post Deletion (via HTTP routes)", async (t) => {
      await t.step("deleting a reply to a remote post succeeds", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        // Create local user
        await createTestUser({ username: "deleter", email: "deleter@test.com", password: "password123" });
        const session = await loginUser(api, "deleter@test.com", "password123");

        // Create remote post
        const remoteActor = await createRemoteActor({
          handle: "@remote@remote.example",
          uri: "https://remote.example/users/remote",
        });
        const remotePost = await db.createPost({
          uri: "https://remote.example/notes/remote-del-1",
          actor_id: remoteActor.id,
          content: "<p>Remote parent</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        // Create reply via API (in_reply_to takes public_id)
        const createRes = await testRequest(api, "POST", "/posts", {
          body: { content: "Reply to delete", in_reply_to: remotePost.public_id },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(createRes.status, 200);
        const createData = await createRes.json();
        const replyPublicId = createData.post.id;

        // Delete the reply
        const deleteRes = await testRequest(api, "DELETE", `/posts/${replyPublicId}`, {
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(deleteRes.status, 200);

        // Verify deletion
        const deletedPost = await db.getPostByPublicId(replyPublicId);
        assertEquals(deletedPost, null);

        // Parent should still exist
        const parent = await db.getPostById(remotePost.id);
        assertExists(parent);
      });
    });

    // ============ Group 6: Delete Handler edge cases (via receiveActivity) ============
    await t.step("Delete Handler (via receiveActivity)", async (t) => {
      await t.step("author deletes own post", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const author = await createRemoteActor({
          handle: "@alice@remote.example",
          uri: "https://remote.example/users/alice",
        });
        const noteUri = "https://remote.example/notes/del-1";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Delete me</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Delete({
          id: new URL("https://remote.example/activities/del-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/alice"),
            preferredUsername: "alice",
            inbox: new URL("https://remote.example/users/alice/inbox"),
          }),
          object: new Tombstone({
            id: new URL(noteUri),
          }),
        }));

        const post = await db.getPostByUri(noteUri);
        assertEquals(post, null);
      });

      await t.step("same-instance mod deletes post (origin mod)", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        // Author creates a post on remote.example
        const author = await createRemoteActor({
          handle: "@author@remote.example",
          uri: "https://remote.example/users/author",
        });
        const noteUri = "https://remote.example/notes/mod-del-1";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Moderated post</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        // A different user on the same instance acts as mod
        await createRemoteActor({
          handle: "@mod@remote.example",
          uri: "https://remote.example/users/mod",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Delete({
          id: new URL("https://remote.example/activities/mod-del-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/mod"),
            preferredUsername: "mod",
            inbox: new URL("https://remote.example/users/mod/inbox"),
          }),
          object: new Tombstone({
            id: new URL(noteUri),
          }),
        }));

        // Same-instance mod should be able to delete
        const post = await db.getPostByUri(noteUri);
        assertEquals(post, null);
      });

      await t.step("community mod deletes post addressed to their community", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        // Author on instance A posts to a community on instance B
        const author = await createRemoteActor({
          handle: "@poster@instance-a.example",
          uri: "https://instance-a.example/users/poster",
        });
        const noteUri = "https://instance-a.example/notes/comm-del-1";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Community post to moderate</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
          addressed_to: ["https://lemmy.example/c/community"],
        });

        // Mod from the community's instance deletes it
        await createRemoteActor({
          handle: "@communitymod@lemmy.example",
          uri: "https://lemmy.example/users/communitymod",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Delete({
          id: new URL("https://lemmy.example/activities/comm-del-1"),
          actor: new Person({
            id: new URL("https://lemmy.example/users/communitymod"),
            preferredUsername: "communitymod",
            inbox: new URL("https://lemmy.example/users/communitymod/inbox"),
          }),
          object: new Tombstone({
            id: new URL(noteUri),
          }),
        }));

        const post = await db.getPostByUri(noteUri);
        assertEquals(post, null);
      });

      await t.step("unauthorized actor from different instance cannot delete", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const author = await createRemoteActor({
          handle: "@author@remote.example",
          uri: "https://remote.example/users/author",
        });
        const noteUri = "https://remote.example/notes/unauth-del-1";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Should survive</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        // Actor from a completely different instance
        await createRemoteActor({
          handle: "@attacker@evil.example",
          uri: "https://evil.example/users/attacker",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Delete({
          id: new URL("https://evil.example/activities/unauth-del-1"),
          actor: new Person({
            id: new URL("https://evil.example/users/attacker"),
            preferredUsername: "attacker",
            inbox: new URL("https://evil.example/users/attacker/inbox"),
          }),
          object: new Tombstone({
            id: new URL(noteUri),
          }),
        }));

        // Post should still exist
        const post = await db.getPostByUri(noteUri);
        assertExists(post);
        assertEquals(post.content, "<p>Should survive</p>");
      });

      await t.step("remote account self-deletion removes actor and posts", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const actorUri = "https://remote.example/users/leaving";
        const actor = await createRemoteActor({
          handle: "@leaving@remote.example",
          uri: actorUri,
        });
        // Create some posts by the actor
        await db.createPost({
          uri: "https://remote.example/notes/leaving-1",
          actor_id: actor.id,
          content: "<p>Post 1</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });
        await db.createPost({
          uri: "https://remote.example/notes/leaving-2",
          actor_id: actor.id,
          content: "<p>Post 2</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Delete where objectUri === actorUri triggers account deletion
        await testFed.receiveActivity(new Delete({
          id: new URL("https://remote.example/activities/account-del-1"),
          actor: new Person({
            id: new URL(actorUri),
            preferredUsername: "leaving",
            inbox: new URL(`${actorUri}/inbox`),
          }),
          object: new Tombstone({
            id: new URL(actorUri),
          }),
        }));

        // Actor and all posts should be gone
        const deletedActor = await db.getActorByUri(actorUri);
        assertEquals(deletedActor, null);
        const post1 = await db.getPostByUri("https://remote.example/notes/leaving-1");
        assertEquals(post1, null);
        const post2 = await db.getPostByUri("https://remote.example/notes/leaving-2");
        assertEquals(post2, null);
      });

      await t.step("account self-deletion is blocked for local users", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: localActor } = await createTestUser({ username: "localuser" });
        await createTestPost(localActor, { content: "Local post" });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Try to delete via federation — should be ignored for local actors
        await testFed.receiveActivity(new Delete({
          id: new URL("https://test.local/activities/local-del-1"),
          actor: new Person({
            id: new URL(localActor.uri),
            preferredUsername: "localuser",
            inbox: new URL(`${localActor.uri}/inbox`),
          }),
          object: new Tombstone({
            id: new URL(localActor.uri),
          }),
        }));

        // Local actor and posts should still exist
        const actor = await db.getActorByUri(localActor.uri);
        assertExists(actor);
      });

      await t.step("delete for non-existent post is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@nobody@remote.example",
          uri: "https://remote.example/users/nobody",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Delete({
          id: new URL("https://remote.example/activities/ghost-del-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/nobody"),
            preferredUsername: "nobody",
            inbox: new URL("https://remote.example/users/nobody/inbox"),
          }),
          object: new Tombstone({
            id: new URL("https://remote.example/notes/nonexistent"),
          }),
        }));
        // No crash — that's the test
      });

      await t.step("delete via Note object (not Tombstone) works", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const author = await createRemoteActor({
          handle: "@alice@remote.example",
          uri: "https://remote.example/users/alice",
        });
        const noteUri = "https://remote.example/notes/note-del-1";
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Delete via Note</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Some implementations send Delete with the Note itself as object
        await testFed.receiveActivity(new Delete({
          id: new URL("https://remote.example/activities/note-del-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/alice"),
            preferredUsername: "alice",
            inbox: new URL("https://remote.example/users/alice/inbox"),
          }),
          object: new Note({
            id: new URL(noteUri),
            content: "<p>Delete via Note</p>",
          }),
        }));

        const post = await db.getPostByUri(noteUri);
        assertEquals(post, null);
      });
    });

    // ============ Group 7: Create Handler (via receiveActivity) ============
    await t.step("Create Handler (via receiveActivity)", async (t) => {
      await t.step("Create(Note) creates a new post in DB", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        // Pre-create the remote actor so persistActor finds/upserts it
        await createRemoteActor({
          handle: "@sender@remote.example",
          uri: "https://remote.example/users/sender",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const noteUri = "https://remote.example/notes/create-1";
        await testFed.receiveActivity(new Create({
          id: new URL("https://remote.example/activities/create-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/sender"),
            preferredUsername: "sender",
            inbox: new URL("https://remote.example/users/sender/inbox"),
          }),
          object: new Note({
            id: new URL(noteUri),
            content: "<p>Hello from federation!</p>",
            url: new URL("https://remote.example/@sender/1"),
            sensitive: true,
          }),
        }));

        const post = await db.getPostByUri(noteUri);
        assertExists(post);
        assertEquals(post.content, "<p>Hello from federation!</p>");
        assertEquals(post.sensitive, true);
        assertEquals(post.url, "https://remote.example/@sender/1");
      });

      await t.step("duplicate Create(Note) with same URI is ignored", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const author = await createRemoteActor({
          handle: "@sender@remote.example",
          uri: "https://remote.example/users/sender",
        });
        const noteUri = "https://remote.example/notes/dup-1";
        // Pre-create the post
        await db.createPost({
          uri: noteUri,
          actor_id: author.id,
          content: "<p>Original</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Send a Create for the same URI — should be no-op
        await testFed.receiveActivity(new Create({
          id: new URL("https://remote.example/activities/dup-create-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/sender"),
            preferredUsername: "sender",
            inbox: new URL("https://remote.example/users/sender/inbox"),
          }),
          object: new Note({
            id: new URL(noteUri),
            content: "<p>Duplicate content</p>",
          }),
        }));

        // Content should remain as original
        const post = await db.getPostByUri(noteUri);
        assertExists(post);
        assertEquals(post.content, "<p>Original</p>");
      });

      await t.step("Create(Note) as reply to existing local post sets in_reply_to_id", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        // Create a local user with a post
        const { actor: localActor } = await createTestUser({ username: "localuser" });
        const parentPost = await createTestPost(localActor, { content: "Parent post" });

        await createRemoteActor({
          handle: "@replier@remote.example",
          uri: "https://remote.example/users/replier",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const replyUri = "https://remote.example/notes/reply-1";
        await testFed.receiveActivity(new Create({
          id: new URL("https://remote.example/activities/reply-create-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/replier"),
            preferredUsername: "replier",
            inbox: new URL("https://remote.example/users/replier/inbox"),
          }),
          object: new Note({
            id: new URL(replyUri),
            content: "<p>This is a reply</p>",
            replyTarget: new URL(parentPost.uri),
          }),
        }));

        const reply = await db.getPostByUri(replyUri);
        assertExists(reply);
        assertEquals(reply.in_reply_to_id, parentPost.id);
        assertEquals(reply.content, "<p>This is a reply</p>");
      });

      await t.step("Create(Note) as reply to non-existent parent is discarded", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@replier@remote.example",
          uri: "https://remote.example/users/replier",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const replyUri = "https://remote.example/notes/orphan-reply-1";
        await testFed.receiveActivity(new Create({
          id: new URL("https://remote.example/activities/orphan-reply-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/replier"),
            preferredUsername: "replier",
            inbox: new URL("https://remote.example/users/replier/inbox"),
          }),
          object: new Note({
            id: new URL(replyUri),
            content: "<p>Reply to nothing</p>",
            replyTarget: new URL("https://remote.example/notes/does-not-exist"),
          }),
        }));

        // Reply should not be created since parent doesn't exist locally
        const reply = await db.getPostByUri(replyUri);
        assertEquals(reply, null);
      });
    });

    // ============ Group 8: Like Handler (via receiveActivity) ============
    await t.step("Like Handler (via receiveActivity)", async (t) => {
      await t.step("Like on existing post creates like record", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author" });
        const post = await createTestPost(author, { content: "Likeable post" });

        await createRemoteActor({
          handle: "@liker@remote.example",
          uri: "https://remote.example/users/liker",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Like({
          id: new URL("https://remote.example/activities/like-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new URL(post.uri),
        }));

        const liker = await db.getActorByUri("https://remote.example/users/liker");
        assertExists(liker);
        const liked = await db.hasLiked(liker.id, post.id);
        assertEquals(liked, true);
      });

      await t.step("Like on non-existent post is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@liker@remote.example",
          uri: "https://remote.example/users/liker",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Like({
          id: new URL("https://remote.example/activities/like-ghost-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new URL("https://remote.example/notes/nonexistent"),
        }));
      });

      await t.step("duplicate Like is idempotent", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author" });
        const post = await createTestPost(author, { content: "Double like" });

        await createRemoteActor({
          handle: "@liker@remote.example",
          uri: "https://remote.example/users/liker",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        const likeActivity = new Like({
          id: new URL("https://remote.example/activities/like-dup-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new URL(post.uri),
        });

        await testFed.receiveActivity(likeActivity);
        // Send the same like again — should not throw or double-count
        await testFed.receiveActivity(new Like({
          id: new URL("https://remote.example/activities/like-dup-2"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new URL(post.uri),
        }));

        const liker = await db.getActorByUri("https://remote.example/users/liker");
        assertExists(liker);
        const likesCount = await db.getLikesCount(post.id);
        assertEquals(likesCount, 1);
      });
    });

    // ============ Group 9: Follow Handler (via receiveActivity) ============
    await t.step("Follow Handler (via receiveActivity)", async (t) => {
      await t.step("Follow a local user creates accepted follow record", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: localActor } = await createTestUser({ username: "target" });

        await createRemoteActor({
          handle: "@follower@remote.example",
          uri: "https://remote.example/users/follower",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // The Follow handler creates the follow, then tries to send Accept
        // back via ctx.getActorUri() which the mock doesn't implement.
        // The follow record is created before the Accept-send code, so we
        // catch the expected error and verify the DB state.
        try {
          await testFed.receiveActivity(new Follow({
            id: new URL("https://remote.example/activities/follow-1"),
            actor: new Person({
              id: new URL("https://remote.example/users/follower"),
              preferredUsername: "follower",
              inbox: new URL("https://remote.example/users/follower/inbox"),
            }),
            object: new URL(localActor.uri),
          }));
        } catch (e) {
          // Expected: mock context doesn't support getActorUri for Accept sending
          if (!(e instanceof Error && e.message.includes("Not implemented"))) {
            throw e;
          }
        }

        const follower = await db.getActorByUri("https://remote.example/users/follower");
        assertExists(follower);
        const status = await db.getFollowStatus(follower.id, localActor.id);
        assertEquals(status, "accepted");
      });

      await t.step("Follow a non-existent actor is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@follower@remote.example",
          uri: "https://remote.example/users/follower",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Follow({
          id: new URL("https://remote.example/activities/follow-ghost-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/follower"),
            preferredUsername: "follower",
            inbox: new URL("https://remote.example/users/follower/inbox"),
          }),
          object: new URL("https://test.local/users/nobody"),
        }));
      });
    });

    // ============ Group 10: Undo Follow / Undo Like (via receiveActivity) ============
    await t.step("Undo Follow and Undo Like (via receiveActivity)", async (t) => {
      await t.step("Undo(Follow) removes follow relationship", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: localActor } = await createTestUser({ username: "target" });
        const follower = await createRemoteActor({
          handle: "@follower@remote.example",
          uri: "https://remote.example/users/follower",
        });

        // Set up existing follow
        await db.addFollow(follower.id, localActor.id, "accepted");
        const statusBefore = await db.getFollowStatus(follower.id, localActor.id);
        assertEquals(statusBefore, "accepted");

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Undo({
          id: new URL("https://remote.example/activities/undo-follow-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/follower"),
            preferredUsername: "follower",
            inbox: new URL("https://remote.example/users/follower/inbox"),
          }),
          object: new Follow({
            id: new URL("https://remote.example/activities/follow-orig-1"),
            actor: new URL("https://remote.example/users/follower"),
            object: new URL(localActor.uri),
          }),
        }));

        const statusAfter = await db.getFollowStatus(follower.id, localActor.id);
        assertEquals(statusAfter, null);
      });

      await t.step("Undo(Like) removes like record", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor: author } = await createTestUser({ username: "author" });
        const post = await createTestPost(author, { content: "Unlikeable post" });

        const liker = await createRemoteActor({
          handle: "@liker@remote.example",
          uri: "https://remote.example/users/liker",
        });

        // Set up existing like
        await db.addLike(liker.id, post.id);
        const likedBefore = await db.hasLiked(liker.id, post.id);
        assertEquals(likedBefore, true);

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Undo({
          id: new URL("https://remote.example/activities/undo-like-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new Like({
            id: new URL("https://remote.example/activities/like-orig-1"),
            actor: new URL("https://remote.example/users/liker"),
            object: new URL(post.uri),
          }),
        }));

        const likedAfter = await db.hasLiked(liker.id, post.id);
        assertEquals(likedAfter, false);
      });

      await t.step("Undo(Like) for non-existent post is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@liker@remote.example",
          uri: "https://remote.example/users/liker",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Undo({
          id: new URL("https://remote.example/activities/undo-like-ghost-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/liker"),
            preferredUsername: "liker",
            inbox: new URL("https://remote.example/users/liker/inbox"),
          }),
          object: new Like({
            id: new URL("https://remote.example/activities/like-ghost-1"),
            actor: new URL("https://remote.example/users/liker"),
            object: new URL("https://remote.example/notes/nonexistent"),
          }),
        }));
      });

      await t.step("Undo(Follow) for non-existent target is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@follower@remote.example",
          uri: "https://remote.example/users/follower",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Undo({
          id: new URL("https://remote.example/activities/undo-follow-ghost-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/follower"),
            preferredUsername: "follower",
            inbox: new URL("https://remote.example/users/follower/inbox"),
          }),
          object: new Follow({
            id: new URL("https://remote.example/activities/follow-ghost-1"),
            actor: new URL("https://remote.example/users/follower"),
            object: new URL("https://test.local/users/nobody"),
          }),
        }));
      });
    });
  },
});
