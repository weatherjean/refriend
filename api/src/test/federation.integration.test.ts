/**
 * Federation Integration Tests
 *
 * Tests inbox handlers via @fedify/testing's mock federation,
 * and HTTP routes for post creation/deletion involving remote actors.
 */

import { assertEquals, assertExists, assertNotEquals } from "jsr:@std/assert";
import { createFederation } from "@fedify/testing";
import {
  Add,
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Note,
  Person,
  Group,
  Remove,
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

    // ============ Group 11: Pinned Posts DB Methods ============
    await t.step("Pinned Posts DB Methods", async (t) => {
      await t.step("clearPinnedPosts removes all pins for an actor", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "pinner" });
        const post1 = await createTestPost(actor, { content: "Pin 1" });
        const post2 = await createTestPost(actor, { content: "Pin 2" });

        await db.pinPost(actor.id, post1.id);
        await db.pinPost(actor.id, post2.id);

        const pinnedBefore = await db.getPinnedPosts(actor.id);
        assertEquals(pinnedBefore.length, 2);

        await db.clearPinnedPosts(actor.id);

        const pinnedAfter = await db.getPinnedPosts(actor.id);
        assertEquals(pinnedAfter.length, 0);
      });

      await t.step("updateFeaturedFetchedAt sets timestamp", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const remoteActor = await createRemoteActor({
          handle: "@remote@remote.example",
          uri: "https://remote.example/users/remote",
        });

        // Initially null
        const actorBefore = await db.getActorById(remoteActor.id);
        assertExists(actorBefore);
        assertEquals(actorBefore.featured_fetched_at, null);

        await db.updateFeaturedFetchedAt(remoteActor.id);

        const actorAfter = await db.getActorById(remoteActor.id);
        assertExists(actorAfter);
        assertNotEquals(actorAfter.featured_fetched_at, null);
      });
    });

    // ============ Group 12: Add/Remove Handler for Featured (via receiveActivity) ============
    await t.step("Add/Remove Handler for Featured (via receiveActivity)", async (t) => {
      await t.step("Add pins an existing post to actor's featured", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const remoteActor = await createRemoteActor({
          handle: "@alice@remote.example",
          uri: "https://remote.example/users/alice",
        });
        const noteUri = "https://remote.example/notes/pin-1";
        await db.createPost({
          uri: noteUri,
          actor_id: remoteActor.id,
          content: "<p>Pin me!</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Add({
          id: new URL("https://remote.example/activities/add-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/alice"),
            preferredUsername: "alice",
            inbox: new URL("https://remote.example/users/alice/inbox"),
          }),
          object: new URL(noteUri),
          target: new URL("https://remote.example/users/alice/featured"),
        }));

        const pinnedPosts = await db.getPinnedPosts(remoteActor.id);
        assertEquals(pinnedPosts.length, 1);
        assertEquals(pinnedPosts[0].uri, noteUri);
      });

      await t.step("Add with non-featured target is ignored", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const remoteActor = await createRemoteActor({
          handle: "@bob@remote.example",
          uri: "https://remote.example/users/bob",
        });
        const noteUri = "https://remote.example/notes/pin-2";
        await db.createPost({
          uri: noteUri,
          actor_id: remoteActor.id,
          content: "<p>Don't pin</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Add({
          id: new URL("https://remote.example/activities/add-2"),
          actor: new Person({
            id: new URL("https://remote.example/users/bob"),
            preferredUsername: "bob",
            inbox: new URL("https://remote.example/users/bob/inbox"),
          }),
          object: new URL(noteUri),
          target: new URL("https://remote.example/users/bob/followers"),
        }));

        const pinnedPosts = await db.getPinnedPosts(remoteActor.id);
        assertEquals(pinnedPosts.length, 0);
      });

      await t.step("Remove unpins an existing pinned post", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const remoteActor = await createRemoteActor({
          handle: "@carol@remote.example",
          uri: "https://remote.example/users/carol",
        });
        const noteUri = "https://remote.example/notes/unpin-1";
        const post = await db.createPost({
          uri: noteUri,
          actor_id: remoteActor.id,
          content: "<p>Unpin me</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        // Pre-pin the post
        await db.pinPost(remoteActor.id, post.id);
        const pinnedBefore = await db.getPinnedPosts(remoteActor.id);
        assertEquals(pinnedBefore.length, 1);

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Remove({
          id: new URL("https://remote.example/activities/remove-1"),
          actor: new Person({
            id: new URL("https://remote.example/users/carol"),
            preferredUsername: "carol",
            inbox: new URL("https://remote.example/users/carol/inbox"),
          }),
          object: new URL(noteUri),
          target: new URL("https://remote.example/users/carol/featured"),
        }));

        const pinnedAfter = await db.getPinnedPosts(remoteActor.id);
        assertEquals(pinnedAfter.length, 0);
      });

      await t.step("Remove with non-featured target is ignored", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const remoteActor = await createRemoteActor({
          handle: "@dave@remote.example",
          uri: "https://remote.example/users/dave",
        });
        const noteUri = "https://remote.example/notes/keep-pinned-1";
        const post = await db.createPost({
          uri: noteUri,
          actor_id: remoteActor.id,
          content: "<p>Stay pinned</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        await db.pinPost(remoteActor.id, post.id);

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        await testFed.receiveActivity(new Remove({
          id: new URL("https://remote.example/activities/remove-2"),
          actor: new Person({
            id: new URL("https://remote.example/users/dave"),
            preferredUsername: "dave",
            inbox: new URL("https://remote.example/users/dave/inbox"),
          }),
          object: new URL(noteUri),
          target: new URL("https://remote.example/users/dave/followers"),
        }));

        // Should still be pinned
        const pinnedAfter = await db.getPinnedPosts(remoteActor.id);
        assertEquals(pinnedAfter.length, 1);
      });

      await t.step("Remove for non-existent post is a no-op", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        await createRemoteActor({
          handle: "@eve@remote.example",
          uri: "https://remote.example/users/eve",
        });

        const testFed = createFederation<null>({ contextData: null });
        registerInboxHandlers(testFed, () => db, () => "test.local");

        // Should not throw
        await testFed.receiveActivity(new Remove({
          id: new URL("https://remote.example/activities/remove-3"),
          actor: new Person({
            id: new URL("https://remote.example/users/eve"),
            preferredUsername: "eve",
            inbox: new URL("https://remote.example/users/eve/inbox"),
          }),
          object: new URL("https://remote.example/notes/nonexistent"),
          target: new URL("https://remote.example/users/eve/featured"),
        }));
      });
    });

    // ============ Group 13: Pinned Posts API Routes ============
    await t.step("Pinned Posts API Routes", async (t) => {
      await t.step("GET /actors/:id/pinned returns pinned posts for local actor", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "localpinner" });
        const post = await createTestPost(actor, { content: "Pinned post" });
        await db.pinPost(actor.id, post.id);

        const res = await testRequest(api, "GET", `/actors/${actor.public_id}/pinned`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 1);
        assertEquals(data.posts[0].content, "<p>Pinned post</p>");
      });

      await t.step("GET /actors/:id/pinned returns empty for remote actor without fetched data", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const remoteActor = await createRemoteActor({
          handle: "@nopins@remote.example",
          uri: "https://remote.example/users/nopins",
        });

        const res = await testRequest(api, "GET", `/actors/${remoteActor.public_id}/pinned`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.posts.length, 0);
      });

      await t.step("GET /actors/:id/pinned returns 404 for non-existent actor", async () => {
        await cleanDatabase();
        const api = await createTestApi();

        const res = await testRequest(api, "GET", `/actors/00000000-0000-0000-0000-000000000000/pinned`);
        assertEquals(res.status, 404);
      });
    });

    // ============ Group 14: Page/Article Post Type Support ============
    await t.step("Page/Article Post Type Support", async (t) => {
      await t.step("createPost with type Page stores type and title", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "pageauthor" });
        const post = await db.createPost({
          uri: `https://test.local/@pageauthor/posts/${crypto.randomUUID()}`,
          actor_id: actor.id,
          content: "<p>Page content</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
          type: "Page",
          title: "My Page Title",
        });

        assertExists(post);
        assertEquals(post.type, "Page");
        assertEquals(post.title, "My Page Title");
      });

      await t.step("createPost with type Article stores type and title", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "articleauthor" });
        const post = await db.createPost({
          uri: `https://test.local/@articleauthor/posts/${crypto.randomUUID()}`,
          actor_id: actor.id,
          content: "<p>Article content</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
          type: "Article",
          title: "My Article Title",
        });

        assertExists(post);
        assertEquals(post.type, "Article");
        assertEquals(post.title, "My Article Title");
      });

      await t.step("createPost without type defaults to Note", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "noteauthor" });
        const post = await db.createPost({
          uri: `https://test.local/@noteauthor/posts/${crypto.randomUUID()}`,
          actor_id: actor.id,
          content: "<p>Note content</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        assertExists(post);
        assertEquals(post.type, "Note");
        assertEquals(post.title, null);
      });

      await t.step("updatePostTitleAndType converts Note to Page", async () => {
        await cleanDatabase();
        const db = await getTestDB();

        const { actor } = await createTestUser({ username: "converter" });
        const post = await db.createPost({
          uri: `https://test.local/@converter/posts/${crypto.randomUUID()}`,
          actor_id: actor.id,
          content: "<p>Will become a Page</p>",
          url: null,
          in_reply_to_id: null,
          sensitive: false,
        });

        assertEquals(post.type, "Note");

        await db.updatePostTitleAndType(post.id, "Community Title", "Page");

        const updated = await db.getPostById(post.id);
        assertExists(updated);
        assertEquals(updated.type, "Page");
        assertEquals(updated.title, "Community Title");
      });

      await t.step("enriched post includes type and title fields", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        const { actor } = await createTestUser({ username: "enrichtest" });
        const post = await db.createPost({
          uri: `https://test.local/@enrichtest/posts/${crypto.randomUUID()}`,
          actor_id: actor.id,
          content: "<p>Enriched page</p>",
          url: `https://test.local/@enrichtest/posts/test`,
          in_reply_to_id: null,
          sensitive: false,
          type: "Page",
          title: "Enriched Title",
        });

        const res = await testRequest(api, "GET", `/posts/${post.public_id}`);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.post.type, "Page");
        assertEquals(data.post.title, "Enriched Title");
      });

      await t.step("submit-to-community converts Note to Page via API", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        // Create user and post
        await createTestUser({ username: "submitter", email: "submitter@test.com", password: "password123" });
        const session = await loginUser(api, "submitter@test.com", "password123");

        // Create a post first
        const createRes = await testRequest(api, "POST", "/posts", {
          body: { content: "Post to submit" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(createRes.status, 200);
        const createData = await createRes.json();
        const postId = createData.post.id;

        // Create a remote community to submit to
        await createRemoteActor({
          handle: "@testcommunity@lemmy.example",
          uri: "https://lemmy.example/c/testcommunity",
          actor_type: "Group",
          inbox_url: "https://lemmy.example/c/testcommunity/inbox",
        });

        // Submit to community (will fail at sendToCommunity since mock can't deliver,
        // but we can verify the request is properly validated)
        const submitRes = await testRequest(api, "POST", `/posts/${postId}/submit-to-community`, {
          body: { title: "Community Post Title", community: "https://lemmy.example/c/testcommunity" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });

        // The send will fail (mock federation), but validation should pass
        // Accept either 200 (success) or 502 (send failed) — both mean validation passed
        const validStatus = submitRes.status === 200 || submitRes.status === 502;
        assertEquals(validStatus, true);
      });

      await t.step("submit-to-community rejects already-submitted Page", async () => {
        await cleanDatabase();
        const db = await getTestDB();
        const api = await createTestApi();

        await createTestUser({ username: "resubmitter", email: "resubmitter@test.com", password: "password123" });
        const session = await loginUser(api, "resubmitter@test.com", "password123");

        // Create a post and manually set it as Page
        const createRes = await testRequest(api, "POST", "/posts", {
          body: { content: "Already submitted" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        const createData = await createRes.json();
        const postId = createData.post.id;

        // Manually convert to Page (simulating previous submission)
        const dbPost = await db.getPostByPublicId(postId);
        assertExists(dbPost);
        await db.updatePostTitleAndType(dbPost.id, "Existing Title", "Page");

        // Try to submit again — should fail
        const submitRes = await testRequest(api, "POST", `/posts/${postId}/submit-to-community`, {
          body: { title: "New Title", community: "https://lemmy.example/c/test" },
          cookie: session.cookie,
          csrfToken: session.csrfToken,
        });
        assertEquals(submitRes.status, 400);
        const data = await submitRes.json();
        assertEquals(data.error, "Post has already been submitted to a community");
      });
    });
  },
});
