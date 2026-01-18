import { Database } from "@db/sqlite";

// Types matching our schema
export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Actor {
  id: number;
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  inbox_url: string;
  shared_inbox_url: string | null;
  url: string | null;
  user_id: number | null;
  created_at: string;
}

export interface KeyPair {
  id: number;
  user_id: number;
  type: "RSASSA-PKCS1-v1_5" | "Ed25519";
  private_key: string;
  public_key: string;
  created_at: string;
}

export interface Follow {
  follower_id: number;
  following_id: number;
  created_at: string;
}

export interface Post {
  id: number;
  uri: string;
  actor_id: number;
  content: string;
  url: string | null;
  in_reply_to_id: number | null;
  likes_count: number;
  created_at: string;
}

// Post with actor data already joined (reduces N+1 queries)
export interface PostWithActor extends Post {
  author: Actor;
}

export interface Hashtag {
  id: number;
  name: string;
}

export interface Session {
  token: string;
  user_id: number;
  created_at: string;
}

export interface Like {
  id: number;
  actor_id: number;
  post_id: number;
  created_at: string;
}

export interface Activity {
  id: number;
  uri: string;
  type: string;
  actor_id: number;
  object_uri: string | null;
  object_type: string | null;
  raw_json: string;
  direction: "inbound" | "outbound";
  created_at: string;
}

export class DB {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  init(schemaPath: string) {
    const schema = Deno.readTextFileSync(schemaPath);
    this.db.exec(schema);
    this.migrate();
  }

  // Run migrations for existing databases
  private migrate() {
    // Add likes_count column if it doesn't exist
    const columns = this.db.prepare("PRAGMA table_info(posts)").all() as { name: string }[];
    const hasLikesCount = columns.some(c => c.name === "likes_count");
    if (!hasLikesCount) {
      this.db.exec("ALTER TABLE posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0");
      // Backfill existing counts
      this.db.exec(`
        UPDATE posts SET likes_count = (
          SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id
        )
      `);
    }
  }

  // Migrate local actors to a new domain
  migrateDomain(newDomain: string) {
    // Get all local actors (those with user_id)
    const localActors = this.db.prepare(
      "SELECT id, uri, handle, url FROM actors WHERE user_id IS NOT NULL"
    ).all() as { id: number; uri: string; handle: string; url: string | null }[];

    for (const actor of localActors) {
      // Extract username from current handle (@user@domain)
      const match = actor.handle.match(/^@([^@]+)@/);
      if (!match) continue;
      const username = match[1];

      // Build new values
      const newUri = `https://${newDomain}/users/${username}`;
      const newHandle = `@${username}@${newDomain}`;
      const newUrl = `https://${newDomain}/@${username}`;
      const newInbox = `https://${newDomain}/users/${username}/inbox`;

      this.db.prepare(
        "UPDATE actors SET uri = ?, handle = ?, url = ?, inbox_url = ? WHERE id = ?"
      ).run(newUri, newHandle, newUrl, newInbox, actor.id);
    }

    // Also update posts URIs for local posts
    const localPosts = this.db.prepare(`
      SELECT p.id, p.uri, p.url, u.username
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      JOIN users u ON a.user_id = u.id
    `).all() as { id: number; uri: string; url: string | null; username: string }[];

    for (const post of localPosts) {
      // Extract post ID from URI
      const match = post.uri.match(/\/posts\/([^/]+)$/);
      if (!match) continue;
      const postId = match[1];

      const newUri = `https://${newDomain}/users/${post.username}/posts/${postId}`;
      const newUrl = `https://${newDomain}/@${post.username}/posts/${postId}`;

      this.db.prepare(
        "UPDATE posts SET uri = ?, url = ? WHERE id = ?"
      ).run(newUri, newUrl, post.id);
    }

    // Update activities URIs too
    this.db.prepare(`
      UPDATE activities SET uri = REPLACE(uri, 'localhost:8000', ?)
      WHERE uri LIKE '%localhost:8000%'
    `).run(newDomain);

    console.log(`[DB] Migrated ${localActors.length} actors and ${localPosts.length} posts to ${newDomain}`);
  }

  // ============ Users ============

  createUser(username: string, passwordHash: string): User {
    this.db.prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)"
    ).run(username, passwordHash);
    return this.getUserByUsername(username)!;
  }

  getUserById(id: number): User | null {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | null;
  }

  getUserByUsername(username: string): User | null {
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | null;
  }

  updateUserPassword(userId: number, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  }

  // ============ Actors ============

  createActor(actor: Omit<Actor, "id" | "created_at">): Actor {
    this.db.prepare(`
      INSERT INTO actors (uri, handle, name, bio, avatar_url, inbox_url, shared_inbox_url, url, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actor.uri, actor.handle, actor.name, actor.bio, actor.avatar_url,
      actor.inbox_url, actor.shared_inbox_url, actor.url, actor.user_id
    );
    return this.getActorByUri(actor.uri)!;
  }

  getActorById(id: number): Actor | null {
    return this.db.prepare("SELECT * FROM actors WHERE id = ?").get(id) as Actor | null;
  }

  getActorByUri(uri: string): Actor | null {
    return this.db.prepare("SELECT * FROM actors WHERE uri = ?").get(uri) as Actor | null;
  }

  getActorByHandle(handle: string): Actor | null {
    return this.db.prepare("SELECT * FROM actors WHERE handle = ?").get(handle) as Actor | null;
  }

  getActorByUserId(userId: number): Actor | null {
    return this.db.prepare("SELECT * FROM actors WHERE user_id = ?").get(userId) as Actor | null;
  }

  getActorByUsername(username: string): Actor | null {
    return this.db.prepare(`
      SELECT a.* FROM actors a
      JOIN users u ON a.user_id = u.id
      WHERE u.username = ?
    `).get(username) as Actor | null;
  }

  // Update local actor profile (name, bio, avatar)
  updateActorProfile(actorId: number, updates: { name?: string; bio?: string; avatar_url?: string }): Actor | null {
    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name || null);
    }
    if (updates.bio !== undefined) {
      fields.push("bio = ?");
      values.push(updates.bio || null);
    }
    if (updates.avatar_url !== undefined) {
      fields.push("avatar_url = ?");
      values.push(updates.avatar_url || null);
    }

    if (fields.length === 0) return this.getActorById(actorId);

    values.push(actorId as unknown as string);
    this.db.prepare(`UPDATE actors SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getActorById(actorId);
  }

  // Search actors by handle or name
  searchActors(query: string, limit = 20): Actor[] {
    const pattern = `%${query}%`;
    return this.db.prepare(`
      SELECT * FROM actors
      WHERE handle LIKE ? OR name LIKE ?
      ORDER BY user_id IS NOT NULL DESC, created_at DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as Actor[];
  }

  // Upsert remote actor (for federation)
  upsertActor(actor: Omit<Actor, "id" | "created_at" | "user_id">): Actor {
    this.db.prepare(`
      INSERT INTO actors (uri, handle, name, bio, avatar_url, inbox_url, shared_inbox_url, url, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(uri) DO UPDATE SET
        handle = excluded.handle,
        name = excluded.name,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        inbox_url = excluded.inbox_url,
        shared_inbox_url = excluded.shared_inbox_url,
        url = excluded.url
    `).run(
      actor.uri, actor.handle, actor.name, actor.bio, actor.avatar_url,
      actor.inbox_url, actor.shared_inbox_url, actor.url
    );
    return this.getActorByUri(actor.uri)!;
  }

  // ============ Keys ============

  getKeyPairs(userId: number): KeyPair[] {
    return this.db.prepare("SELECT * FROM keys WHERE user_id = ?").all(userId) as KeyPair[];
  }

  getKeyPair(userId: number, type: KeyPair["type"]): KeyPair | null {
    return this.db.prepare(
      "SELECT * FROM keys WHERE user_id = ? AND type = ?"
    ).get(userId, type) as KeyPair | null;
  }

  saveKeyPair(userId: number, type: KeyPair["type"], privateKey: string, publicKey: string): KeyPair {
    this.db.prepare(`
      INSERT INTO keys (user_id, type, private_key, public_key)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, type) DO UPDATE SET
        private_key = excluded.private_key,
        public_key = excluded.public_key
    `).run(userId, type, privateKey, publicKey);
    return this.getKeyPair(userId, type)!;
  }

  // ============ Follows ============

  addFollow(followerId: number, followingId: number): void {
    this.db.prepare(
      "INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)"
    ).run(followerId, followingId);
  }

  removeFollow(followerId: number, followingId: number): void {
    this.db.prepare(
      "DELETE FROM follows WHERE follower_id = ? AND following_id = ?"
    ).run(followerId, followingId);
  }

  isFollowing(followerId: number, followingId: number): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
    ).get(followerId, followingId);
    return !!row;
  }

  getFollowers(actorId: number): Actor[] {
    return this.db.prepare(`
      SELECT a.* FROM actors a
      JOIN follows f ON a.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC
    `).all(actorId) as Actor[];
  }

  getFollowing(actorId: number): Actor[] {
    return this.db.prepare(`
      SELECT a.* FROM actors a
      JOIN follows f ON a.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC
    `).all(actorId) as Actor[];
  }

  getFollowersCount(actorId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM follows WHERE following_id = ?"
    ).get(actorId) as { count: number };
    return row.count;
  }

  getFollowingCount(actorId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM follows WHERE follower_id = ?"
    ).get(actorId) as { count: number };
    return row.count;
  }

  // ============ Posts ============

  createPost(post: Omit<Post, "id" | "created_at" | "likes_count"> & { created_at?: string }): Post {
    if (post.created_at) {
      this.db.prepare(`
        INSERT INTO posts (uri, actor_id, content, url, in_reply_to_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(post.uri, post.actor_id, post.content, post.url, post.in_reply_to_id, post.created_at);
    } else {
      this.db.prepare(`
        INSERT INTO posts (uri, actor_id, content, url, in_reply_to_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(post.uri, post.actor_id, post.content, post.url, post.in_reply_to_id);
    }
    return this.getPostByUri(post.uri)!;
  }

  updatePostUri(id: number, uri: string, url: string | null): void {
    this.db.prepare("UPDATE posts SET uri = ?, url = ? WHERE id = ?").run(uri, url, id);
  }

  getPostById(id: number): Post | null {
    return this.db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as Post | null;
  }

  getPostByUri(uri: string): Post | null {
    return this.db.prepare("SELECT * FROM posts WHERE uri = ?").get(uri) as Post | null;
  }

  getPostsByActor(actorId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT * FROM posts
      WHERE actor_id = ? AND in_reply_to_id IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Post[];
  }

  getRepliesByActor(actorId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT * FROM posts
      WHERE actor_id = ? AND in_reply_to_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Post[];
  }

  // Home feed: posts from followed actors
  getHomeFeed(actorId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN follows f ON p.actor_id = f.following_id
      WHERE f.follower_id = ? AND p.in_reply_to_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Post[];
  }

  // Public timeline: all local posts
  getPublicTimeline(limit = 50): Post[] {
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE a.user_id IS NOT NULL AND p.in_reply_to_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(limit) as Post[];
  }

  // ============ Feed methods with actor JOIN (optimized) ============

  // Helper to parse joined post+actor rows
  private parsePostWithActor(row: Record<string, unknown>): PostWithActor {
    return {
      id: row.id as number,
      uri: row.uri as string,
      actor_id: row.actor_id as number,
      content: row.content as string,
      url: row.url as string | null,
      in_reply_to_id: row.in_reply_to_id as number | null,
      likes_count: row.likes_count as number,
      created_at: row.created_at as string,
      author: {
        id: row.author_id as number,
        uri: row.author_uri as string,
        handle: row.author_handle as string,
        name: row.author_name as string | null,
        bio: row.author_bio as string | null,
        avatar_url: row.author_avatar_url as string | null,
        inbox_url: row.author_inbox_url as string,
        shared_inbox_url: row.author_shared_inbox_url as string | null,
        url: row.author_url as string | null,
        user_id: row.author_user_id as number | null,
        created_at: row.author_created_at as string,
      },
    };
  }

  private readonly postWithActorSelect = `
    p.id, p.uri, p.actor_id, p.content, p.url, p.in_reply_to_id, p.likes_count, p.created_at,
    a.id as author_id, a.uri as author_uri, a.handle as author_handle, a.name as author_name,
    a.bio as author_bio, a.avatar_url as author_avatar_url, a.inbox_url as author_inbox_url,
    a.shared_inbox_url as author_shared_inbox_url, a.url as author_url, a.user_id as author_user_id,
    a.created_at as author_created_at
  `;

  getPublicTimelineWithActor(limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE a.user_id IS NOT NULL AND p.in_reply_to_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getHomeFeedWithActor(actorId: number, limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      JOIN follows f ON p.actor_id = f.following_id
      WHERE f.follower_id = ? AND p.in_reply_to_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getPostsByActorWithActor(actorId: number, limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE p.actor_id = ? AND p.in_reply_to_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getRepliesByActorWithActor(actorId: number, limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE p.actor_id = ? AND p.in_reply_to_id IS NOT NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getRepliesWithActor(postId: number, limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE p.in_reply_to_id = ?
      ORDER BY p.created_at ASC
      LIMIT ?
    `).all(postId, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  // Batch methods for reducing N+1 queries
  getHashtagsForPosts(postIds: number[]): Map<number, string[]> {
    if (postIds.length === 0) return new Map();
    const placeholders = postIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT ph.post_id, h.name
      FROM post_hashtags ph
      JOIN hashtags h ON ph.hashtag_id = h.id
      WHERE ph.post_id IN (${placeholders})
    `).all(...postIds) as { post_id: number; name: string }[];

    const map = new Map<number, string[]>();
    for (const row of rows) {
      const existing = map.get(row.post_id) || [];
      existing.push(row.name);
      map.set(row.post_id, existing);
    }
    return map;
  }

  getLikedPostIds(actorId: number, postIds: number[]): Set<number> {
    if (postIds.length === 0) return new Set();
    const placeholders = postIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT post_id FROM likes
      WHERE actor_id = ? AND post_id IN (${placeholders})
    `).all(actorId, ...postIds) as { post_id: number }[];
    return new Set(rows.map(r => r.post_id));
  }

  getBoostedPostIds(actorId: number, postIds: number[]): Set<number> {
    if (postIds.length === 0) return new Set();
    const placeholders = postIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT post_id FROM boosts
      WHERE actor_id = ? AND post_id IN (${placeholders})
    `).all(actorId, ...postIds) as { post_id: number }[];
    return new Set(rows.map(r => r.post_id));
  }

  getPinnedPostIds(actorId: number, postIds: number[]): Set<number> {
    if (postIds.length === 0) return new Set();
    const placeholders = postIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT post_id FROM pinned_posts
      WHERE actor_id = ? AND post_id IN (${placeholders})
    `).all(actorId, ...postIds) as { post_id: number }[];
    return new Set(rows.map(r => r.post_id));
  }

  getRepliesCounts(postIds: number[]): Map<number, number> {
    if (postIds.length === 0) return new Map();
    const placeholders = postIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT in_reply_to_id as post_id, COUNT(*) as count
      FROM posts
      WHERE in_reply_to_id IN (${placeholders})
      GROUP BY in_reply_to_id
    `).all(...postIds) as { post_id: number; count: number }[];

    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(row.post_id, row.count);
    }
    return map;
  }

  getPinnedPostsWithActor(actorId: number): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      JOIN pinned_posts pp ON p.id = pp.post_id
      WHERE pp.actor_id = ?
      ORDER BY pp.pinned_at DESC
    `).all(actorId) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getBoostedPostsWithActor(actorId: number, limit = 50): PostWithActor[] {
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      JOIN boosts b ON p.id = b.post_id
      WHERE b.actor_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  getPostsByHashtagWithActor(hashtagName: string, limit = 50): PostWithActor[] {
    const normalized = hashtagName.toLowerCase().replace(/^#/, "");
    const rows = this.db.prepare(`
      SELECT ${this.postWithActorSelect}
      FROM posts p
      JOIN actors a ON p.actor_id = a.id
      JOIN post_hashtags ph ON p.id = ph.post_id
      JOIN hashtags h ON ph.hashtag_id = h.id
      WHERE h.name = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(normalized, limit) as Record<string, unknown>[];
    return rows.map(row => this.parsePostWithActor(row));
  }

  deletePost(id: number): void {
    this.db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  }

  getReplies(postId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT * FROM posts
      WHERE in_reply_to_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(postId, limit) as Post[];
  }

  getRepliesCount(postId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM posts WHERE in_reply_to_id = ?"
    ).get(postId) as { count: number };
    return row.count;
  }

  // ============ Hashtags ============

  getOrCreateHashtag(name: string): Hashtag {
    const normalized = name.toLowerCase().replace(/^#/, "");
    this.db.prepare(
      "INSERT OR IGNORE INTO hashtags (name) VALUES (?)"
    ).run(normalized);
    return this.db.prepare(
      "SELECT * FROM hashtags WHERE name = ?"
    ).get(normalized) as Hashtag;
  }

  addPostHashtag(postId: number, hashtagId: number): void {
    this.db.prepare(
      "INSERT OR IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)"
    ).run(postId, hashtagId);
  }

  getPostHashtags(postId: number): Hashtag[] {
    return this.db.prepare(`
      SELECT h.* FROM hashtags h
      JOIN post_hashtags ph ON h.id = ph.hashtag_id
      WHERE ph.post_id = ?
    `).all(postId) as Hashtag[];
  }

  getPostsByHashtag(hashtagName: string, limit = 50): Post[] {
    const normalized = hashtagName.toLowerCase().replace(/^#/, "");
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_hashtags ph ON p.id = ph.post_id
      JOIN hashtags h ON ph.hashtag_id = h.id
      WHERE h.name = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(normalized, limit) as Post[];
  }

  // Get most popular tags (all-time) - simple and fast, no time filter
  getPopularTags(limit = 5): { name: string; count: number }[] {
    return this.db.prepare(`
      SELECT h.name, COUNT(ph.post_id) as count
      FROM hashtags h
      JOIN post_hashtags ph ON h.id = ph.hashtag_id
      GROUP BY h.id
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as { name: string; count: number }[];
  }

  // Search hashtags by partial match (fuzzy)
  searchTags(query: string, limit = 10): { name: string; count: number }[] {
    const normalized = query.toLowerCase().replace(/^#/, "");
    if (!normalized) return [];

    return this.db.prepare(`
      SELECT h.name, COUNT(ph.post_id) as count
      FROM hashtags h
      LEFT JOIN post_hashtags ph ON h.id = ph.hashtag_id
      WHERE h.name LIKE ?
      GROUP BY h.id
      ORDER BY
        CASE WHEN h.name = ? THEN 0 ELSE 1 END,
        CASE WHEN h.name LIKE ? THEN 0 ELSE 1 END,
        count DESC,
        h.name ASC
      LIMIT ?
    `).all(`%${normalized}%`, normalized, `${normalized}%`, limit) as { name: string; count: number }[];
  }

  // Get trending tags based on recent post activity
  getTrendingTags(limit = 10, hoursBack = 48): { name: string; count: number }[] {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .split(".")[0];

    return this.db.prepare(`
      SELECT h.name, COUNT(*) as count
      FROM hashtags h
      JOIN post_hashtags ph ON h.id = ph.hashtag_id
      JOIN posts p ON ph.post_id = p.id
      WHERE p.created_at >= ?
      GROUP BY h.id
      ORDER BY count DESC, h.name ASC
      LIMIT ?
    `).all(cutoff, limit) as { name: string; count: number }[];
  }

  // ============ Likes ============

  addLike(actorId: number, postId: number): void {
    // Use transaction to atomically insert like and update count
    this.db.exec("BEGIN");
    try {
      const result = this.db.prepare(
        "INSERT OR IGNORE INTO likes (actor_id, post_id) VALUES (?, ?)"
      ).run(actorId, postId);
      // Only increment if a row was actually inserted
      if (result > 0) {
        this.db.prepare(
          "UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?"
        ).run(postId);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  removeLike(actorId: number, postId: number): void {
    // Use transaction to atomically delete like and update count
    this.db.exec("BEGIN");
    try {
      const result = this.db.prepare(
        "DELETE FROM likes WHERE actor_id = ? AND post_id = ?"
      ).run(actorId, postId);
      // Only decrement if a row was actually deleted
      if (result > 0) {
        this.db.prepare(
          "UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?"
        ).run(postId);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  hasLiked(actorId: number, postId: number): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM likes WHERE actor_id = ? AND post_id = ?"
    ).get(actorId, postId);
    return !!row;
  }

  getLikesCount(postId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM likes WHERE post_id = ?"
    ).get(postId) as { count: number };
    return row.count;
  }

  getPostLikers(postId: number): Actor[] {
    return this.db.prepare(`
      SELECT a.* FROM actors a
      JOIN likes l ON a.id = l.actor_id
      WHERE l.post_id = ?
      ORDER BY l.created_at DESC
    `).all(postId) as Actor[];
  }

  getLikedPosts(actorId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN likes l ON p.id = l.post_id
      WHERE l.actor_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Post[];
  }

  getLikedPostsCount(actorId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM likes WHERE actor_id = ?"
    ).get(actorId) as { count: number };
    return row.count;
  }

  // ============ Boosts ============

  addBoost(actorId: number, postId: number): void {
    this.db.prepare(
      "INSERT OR IGNORE INTO boosts (actor_id, post_id) VALUES (?, ?)"
    ).run(actorId, postId);
  }

  removeBoost(actorId: number, postId: number): void {
    this.db.prepare(
      "DELETE FROM boosts WHERE actor_id = ? AND post_id = ?"
    ).run(actorId, postId);
  }

  hasBoosted(actorId: number, postId: number): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM boosts WHERE actor_id = ? AND post_id = ?"
    ).get(actorId, postId);
    return !!row;
  }

  getBoostsCount(postId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM boosts WHERE post_id = ?"
    ).get(postId) as { count: number };
    return row.count;
  }

  getPostBoosters(postId: number): Actor[] {
    return this.db.prepare(`
      SELECT a.* FROM actors a
      JOIN boosts b ON a.id = b.actor_id
      WHERE b.post_id = ?
      ORDER BY b.created_at DESC
    `).all(postId) as Actor[];
  }

  getBoostedPosts(actorId: number, limit = 50): Post[] {
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN boosts b ON p.id = b.post_id
      WHERE b.actor_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Post[];
  }

  // ============ Pinned Posts ============

  pinPost(actorId: number, postId: number): void {
    this.db.prepare(
      "INSERT OR IGNORE INTO pinned_posts (actor_id, post_id) VALUES (?, ?)"
    ).run(actorId, postId);
  }

  unpinPost(actorId: number, postId: number): void {
    this.db.prepare(
      "DELETE FROM pinned_posts WHERE actor_id = ? AND post_id = ?"
    ).run(actorId, postId);
  }

  isPinned(actorId: number, postId: number): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM pinned_posts WHERE actor_id = ? AND post_id = ?"
    ).get(actorId, postId);
    return !!row;
  }

  getPinnedPosts(actorId: number): Post[] {
    return this.db.prepare(`
      SELECT p.* FROM posts p
      JOIN pinned_posts pp ON p.id = pp.post_id
      WHERE pp.actor_id = ?
      ORDER BY pp.pinned_at DESC
    `).all(actorId) as Post[];
  }

  getPinnedPostsCount(actorId: number): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM pinned_posts WHERE actor_id = ?"
    ).get(actorId) as { count: number };
    return row.count;
  }

  // ============ Sessions ============

  createSession(userId: number): string {
    const token = crypto.randomUUID();
    this.db.prepare(
      "INSERT INTO sessions (token, user_id) VALUES (?, ?)"
    ).run(token, userId);
    return token;
  }

  getSession(token: string): Session | null {
    return this.db.prepare(
      "SELECT * FROM sessions WHERE token = ?"
    ).get(token) as Session | null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  // ============ Activities ============

  storeActivity(activity: Omit<Activity, "id" | "created_at">): Activity {
    this.db.prepare(`
      INSERT INTO activities (uri, type, actor_id, object_uri, object_type, raw_json, direction)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uri) DO UPDATE SET
        raw_json = excluded.raw_json
    `).run(
      activity.uri,
      activity.type,
      activity.actor_id,
      activity.object_uri,
      activity.object_type,
      activity.raw_json,
      activity.direction
    );
    return this.getActivityByUri(activity.uri)!;
  }

  getActivityByUri(uri: string): Activity | null {
    return this.db.prepare(
      "SELECT * FROM activities WHERE uri = ?"
    ).get(uri) as Activity | null;
  }

  getActivitiesByActor(actorId: number, limit = 50): Activity[] {
    return this.db.prepare(`
      SELECT * FROM activities
      WHERE actor_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Activity[];
  }

  getOutboxActivities(actorId: number, limit = 50): Activity[] {
    return this.db.prepare(`
      SELECT * FROM activities
      WHERE actor_id = ? AND direction = 'outbound'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(actorId, limit) as Activity[];
  }

  // ============ Stats (for NodeInfo) ============

  getLocalUserCount(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM users"
    ).get() as { count: number };
    return row.count;
  }

  getLocalPostCount(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM posts p
      JOIN actors a ON p.actor_id = a.id
      WHERE a.user_id IS NOT NULL
    `).get() as { count: number };
    return row.count;
  }
}
