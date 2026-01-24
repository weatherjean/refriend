import { Pool, PoolClient } from "postgres";

// Types matching our schema
export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  created_at: string;
}

export interface PasswordResetToken {
  id: number;
  token: string;
  user_id: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Actor {
  id: number;
  public_id: string;
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  inbox_url: string;
  shared_inbox_url: string | null;
  url: string | null;
  user_id: number | null;
  actor_type: "Person" | "Group";
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

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

export interface VideoEmbed {
  platform: 'youtube' | 'tiktok' | 'peertube';
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
}

export interface Post {
  id: number;
  public_id: string;
  uri: string;
  actor_id: number;
  content: string;
  url: string | null;
  in_reply_to_id: number | null;
  addressed_to: string[];  // ActivityPub to/cc recipients (actor URIs)
  likes_count: number;
  sensitive: boolean;
  link_preview: LinkPreview | null;
  video_embed: VideoEmbed | null;
  created_at: string;
}

export interface Media {
  id: number;
  post_id: number;
  url: string;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

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
  expires_at: string;
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
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool(connectionString, 10);
  }

  // Expose pool for community DB
  getPool(): Pool {
    return this.pool;
  }

  async init(schemaPath: string) {
    const schema = await Deno.readTextFile(schemaPath);
    const client = await this.pool.connect();
    try {
      await client.queryArray(schema);
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  async query<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  // ============ Users ============

  async createUser(username: string, passwordHash: string, email?: string): Promise<User> {
    return this.query(async (client) => {
      const result = await client.queryObject<User>`
        INSERT INTO users (username, password_hash, email) VALUES (${username}, ${passwordHash}, ${email ?? null})
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<User>`SELECT * FROM users WHERE id = ${id}`;
      return result.rows[0] || null;
    });
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<User>`SELECT * FROM users WHERE username = ${username}`;
      return result.rows[0] || null;
    });
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<User>`SELECT * FROM users WHERE email = ${email}`;
      return result.rows[0] || null;
    });
  }

  async updateUserEmail(userId: number, email: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`UPDATE users SET email = ${email} WHERE id = ${userId}`;
    });
  }

  // ============ Password Reset Tokens ============

  async createPasswordResetToken(userId: number): Promise<string> {
    return this.query(async (client) => {
      // Generate a secure random token (64 chars)
      const tokenBytes = crypto.getRandomValues(new Uint8Array(48));
      const token = btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await client.queryObject`
        INSERT INTO password_reset_tokens (token, user_id, expires_at)
        VALUES (${token}, ${userId}, ${expiresAt})
      `;
      return token;
    });
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<PasswordResetToken>`
        SELECT * FROM password_reset_tokens
        WHERE token = ${token}
          AND expires_at > NOW()
          AND used_at IS NULL
      `;
      return result.rows[0] || null;
    });
  }

  async markTokenUsed(token: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        UPDATE password_reset_tokens SET used_at = NOW() WHERE token = ${token}
      `;
    });
  }

  async getLastResetRequestTime(userId: number): Promise<Date | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ created_at: Date }>`
        SELECT created_at FROM password_reset_tokens
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return result.rows[0]?.created_at || null;
    });
  }

  // ============ Actors ============

  async createActor(actor: Omit<Actor, "id" | "public_id" | "created_at">): Promise<Actor> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        INSERT INTO actors (uri, handle, name, bio, avatar_url, inbox_url, shared_inbox_url, url, user_id, actor_type)
        VALUES (${actor.uri}, ${actor.handle}, ${actor.name}, ${actor.bio}, ${actor.avatar_url},
                ${actor.inbox_url}, ${actor.shared_inbox_url}, ${actor.url}, ${actor.user_id}, ${actor.actor_type})
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  async getActorById(id: number): Promise<Actor | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE id = ${id}`;
      return result.rows[0] || null;
    });
  }

  async getActorsByIds(ids: number[]): Promise<Map<number, Actor>> {
    if (ids.length === 0) return new Map();
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors WHERE id = ANY(${ids})
      `;
      const map = new Map<number, Actor>();
      for (const actor of result.rows) {
        map.set(actor.id, actor);
      }
      return map;
    });
  }

  async getActorByPublicId(publicId: string): Promise<Actor | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE public_id::text = ${publicId}`;
      return result.rows[0] || null;
    });
  }

  async getActorByUri(uri: string): Promise<Actor | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE uri = ${uri}`;
      return result.rows[0] || null;
    });
  }

  async getActorByHandle(handle: string): Promise<Actor | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE handle = ${handle}`;
      return result.rows[0] || null;
    });
  }

  async getActorByUserId(userId: number): Promise<Actor | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE user_id = ${userId}`;
      return result.rows[0] || null;
    });
  }

  async getActorByUsername(username: string): Promise<Actor | null> {
    return this.query(async (client) => {
      // First try to find a user by username
      const userResult = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN users u ON a.user_id = u.id
        WHERE u.username = ${username}
      `;
      if (userResult.rows[0]) {
        return userResult.rows[0];
      }

      // Then try to find a community (Group) by name
      const communityResult = await client.queryObject<Actor>`
        SELECT * FROM actors
        WHERE actor_type = 'Group' AND name = ${username}
      `;
      return communityResult.rows[0] || null;
    });
  }

  async updateActorProfile(actorId: number, updates: { name?: string; bio?: string; avatar_url?: string }): Promise<Actor | null> {
    return this.query(async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramNum = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramNum++}`);
        values.push(updates.name || null);
      }
      if (updates.bio !== undefined) {
        sets.push(`bio = $${paramNum++}`);
        values.push(updates.bio || null);
      }
      if (updates.avatar_url !== undefined) {
        sets.push(`avatar_url = $${paramNum++}`);
        values.push(updates.avatar_url || null);
      }

      if (sets.length === 0) {
        const result = await client.queryObject<Actor>`SELECT * FROM actors WHERE id = ${actorId}`;
        return result.rows[0] || null;
      }

      values.push(actorId);
      const query = `UPDATE actors SET ${sets.join(", ")} WHERE id = $${paramNum} RETURNING *`;
      const result = await client.queryObject<Actor>(query, values);
      return result.rows[0] || null;
    });
  }

  async searchActors(query: string, limit = 20, handleOnly = false): Promise<Actor[]> {
    return this.query(async (client) => {
      const pattern = `%${query}%`;
      const result = handleOnly
        ? await client.queryObject<Actor>`
            SELECT * FROM actors
            WHERE handle ILIKE ${pattern}
            ORDER BY user_id IS NOT NULL DESC, created_at DESC
            LIMIT ${limit}
          `
        : await client.queryObject<Actor>`
            SELECT * FROM actors
            WHERE handle ILIKE ${pattern} OR name ILIKE ${pattern}
            ORDER BY user_id IS NOT NULL DESC, created_at DESC
            LIMIT ${limit}
          `;
      return result.rows;
    });
  }

  async searchPosts(query: string, limit = 20): Promise<{ posts: PostWithActor[]; lowConfidence: boolean }> {
    return this.query(async (client) => {
      // Hybrid search: ILIKE for exact matches + trigram similarity for fuzzy
      const pattern = `%${query}%`;
      const result = await client.queryObject(`
        SELECT DISTINCT ON (p.id) ${this.postWithActorSelect},
               COALESCE(similarity(p.content, $1), 0) as sim,
               CASE WHEN p.content ILIKE $2 THEN 1 ELSE 0 END as exact_match
        FROM posts p
        JOIN actors a ON p.actor_id = a.id
        WHERE (p.content ILIKE $2 OR similarity(p.content, $1) > 0.05)
          AND p.created_at > NOW() - INTERVAL '14 days'
        ORDER BY p.id, sim DESC
        LIMIT $3
      `, [query, pattern, limit * 3]);

      const rows = result.rows.map(row => ({
        post: this.parsePostWithActor(row as Record<string, unknown>),
        sim: (row as Record<string, unknown>).sim as number,
        exactMatch: (row as Record<string, unknown>).exact_match === 1
      }));

      // Sort by exact match first, then similarity
      rows.sort((a, b) => {
        if (a.exactMatch !== b.exactMatch) return b.exactMatch ? 1 : -1;
        return b.sim - a.sim;
      });

      // High confidence: exact matches or similarity > 0.2
      const highConfidence = rows.filter(r => r.exactMatch || r.sim > 0.2);

      if (highConfidence.length > 0) {
        return { posts: highConfidence.slice(0, limit).map(r => r.post), lowConfidence: false };
      }

      // Fallback: return a few low confidence results
      const lowConfidenceResults = rows.slice(0, 5).map(r => r.post);
      return { posts: lowConfidenceResults, lowConfidence: lowConfidenceResults.length > 0 };
    });
  }

  async upsertActor(actor: Omit<Actor, "id" | "public_id" | "created_at" | "user_id">): Promise<Actor> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        INSERT INTO actors (uri, handle, name, bio, avatar_url, inbox_url, shared_inbox_url, url, user_id, actor_type)
        VALUES (${actor.uri}, ${actor.handle}, ${actor.name}, ${actor.bio}, ${actor.avatar_url},
                ${actor.inbox_url}, ${actor.shared_inbox_url}, ${actor.url}, NULL, ${actor.actor_type})
        ON CONFLICT(uri) DO UPDATE SET
          handle = EXCLUDED.handle,
          name = EXCLUDED.name,
          bio = EXCLUDED.bio,
          avatar_url = EXCLUDED.avatar_url,
          inbox_url = EXCLUDED.inbox_url,
          shared_inbox_url = EXCLUDED.shared_inbox_url,
          url = EXCLUDED.url,
          actor_type = EXCLUDED.actor_type
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  // ============ Keys ============

  async getKeyPairs(userId: number): Promise<KeyPair[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`SELECT * FROM keys WHERE user_id = ${userId}`;
      return result.rows;
    });
  }

  async getKeyPair(userId: number, type: KeyPair["type"]): Promise<KeyPair | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`
        SELECT * FROM keys WHERE user_id = ${userId} AND type = ${type}
      `;
      return result.rows[0] || null;
    });
  }

  async saveKeyPair(userId: number, type: KeyPair["type"], privateKey: string, publicKey: string): Promise<KeyPair> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`
        INSERT INTO keys (user_id, type, private_key, public_key)
        VALUES (${userId}, ${type}, ${privateKey}, ${publicKey})
        ON CONFLICT(user_id, type) DO UPDATE SET
          private_key = EXCLUDED.private_key,
          public_key = EXCLUDED.public_key
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  // Keys by actor_id (for communities/Groups)
  async getKeyPairsByActorId(actorId: number): Promise<KeyPair[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`SELECT * FROM keys WHERE actor_id = ${actorId}`;
      return result.rows;
    });
  }

  async getKeyPairByActorId(actorId: number, type: KeyPair["type"]): Promise<KeyPair | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`
        SELECT * FROM keys WHERE actor_id = ${actorId} AND type = ${type}
      `;
      return result.rows[0] || null;
    });
  }

  async saveKeyPairByActorId(actorId: number, type: KeyPair["type"], privateKey: string, publicKey: string): Promise<KeyPair> {
    return this.query(async (client) => {
      const result = await client.queryObject<KeyPair>`
        INSERT INTO keys (actor_id, type, private_key, public_key)
        VALUES (${actorId}, ${type}, ${privateKey}, ${publicKey})
        ON CONFLICT(actor_id, type) DO UPDATE SET
          private_key = EXCLUDED.private_key,
          public_key = EXCLUDED.public_key
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  // ============ Follows ============

  async addFollow(followerId: number, followingId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO follows (follower_id, following_id) VALUES (${followerId}, ${followingId})
        ON CONFLICT DO NOTHING
      `;
    });
  }

  async removeFollow(followerId: number, followingId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`;
    });
  }

  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
      `;
      return result.rows.length > 0;
    });
  }

  async getFollowers(actorId: number): Promise<Actor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN follows f ON a.id = f.follower_id
        WHERE f.following_id = ${actorId}
        ORDER BY f.created_at DESC
      `;
      return result.rows;
    });
  }

  async getFollowing(actorId: number): Promise<Actor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN follows f ON a.id = f.following_id
        WHERE f.follower_id = ${actorId}
        ORDER BY f.created_at DESC
      `;
      return result.rows;
    });
  }

  async getFollowersCount(actorId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM follows WHERE following_id = ${actorId}
      `;
      return Number(result.rows[0].count);
    });
  }

  async getFollowingCount(actorId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM follows WHERE follower_id = ${actorId}
      `;
      return Number(result.rows[0].count);
    });
  }

  async getTrendingUsers(limit = 3): Promise<(Actor & { new_followers: number })[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor & { new_followers: bigint }>`
        SELECT a.*, COUNT(f.follower_id) as new_followers
        FROM actors a
        JOIN follows f ON f.following_id = a.id
        WHERE f.created_at > NOW() - INTERVAL '24 hours'
          AND a.user_id IS NOT NULL
        GROUP BY a.id
        ORDER BY new_followers DESC
        LIMIT ${limit}
      `;
      return result.rows.map(r => ({ ...r, new_followers: Number(r.new_followers) }));
    });
  }

  // ============ Posts ============

  async createPost(post: Omit<Post, "id" | "public_id" | "created_at" | "likes_count" | "boosts_count" | "replies_count" | "hot_score" | "addressed_to" | "link_preview" | "video_embed"> & { created_at?: string; addressed_to?: string[]; link_preview?: LinkPreview | null; video_embed?: VideoEmbed | null }): Promise<Post> {
    return this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        const addressedTo = post.addressed_to || [];
        const linkPreview = post.link_preview ? JSON.stringify(post.link_preview) : null;
        const videoEmbed = post.video_embed ? JSON.stringify(post.video_embed) : null;
        let result;
        if (post.created_at) {
          result = await client.queryObject<Post>`
            INSERT INTO posts (uri, actor_id, content, url, in_reply_to_id, sensitive, addressed_to, link_preview, video_embed, created_at)
            VALUES (${post.uri}, ${post.actor_id}, ${post.content}, ${post.url}, ${post.in_reply_to_id}, ${post.sensitive}, ${addressedTo}, ${linkPreview}, ${videoEmbed}, ${post.created_at})
            RETURNING *
          `;
        } else {
          result = await client.queryObject<Post>`
            INSERT INTO posts (uri, actor_id, content, url, in_reply_to_id, sensitive, addressed_to, link_preview, video_embed)
            VALUES (${post.uri}, ${post.actor_id}, ${post.content}, ${post.url}, ${post.in_reply_to_id}, ${post.sensitive}, ${addressedTo}, ${linkPreview}, ${videoEmbed})
            RETURNING *
          `;
        }
        // Increment parent's replies_count if this is a reply
        if (post.in_reply_to_id) {
          await client.queryArray`UPDATE posts SET replies_count = replies_count + 1 WHERE id = ${post.in_reply_to_id}`;
        }
        await client.queryArray`COMMIT`;
        return result.rows[0];
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  async updatePostUri(id: number, uri: string, url: string | null): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`UPDATE posts SET uri = ${uri}, url = ${url} WHERE id = ${id}`;
    });
  }

  async updatePostSensitive(id: number, sensitive: boolean): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`UPDATE posts SET sensitive = ${sensitive} WHERE id = ${id}`;
    });
  }

  async updatePostLinkPreview(id: number, linkPreview: LinkPreview | null): Promise<void> {
    await this.query(async (client) => {
      const json = linkPreview ? JSON.stringify(linkPreview) : null;
      await client.queryArray`UPDATE posts SET link_preview = ${json} WHERE id = ${id}`;
    });
  }

  async updatePostVideoEmbed(id: number, videoEmbed: VideoEmbed | null): Promise<void> {
    await this.query(async (client) => {
      const json = videoEmbed ? JSON.stringify(videoEmbed) : null;
      await client.queryArray`UPDATE posts SET video_embed = ${json} WHERE id = ${id}`;
    });
  }

  async getPostById(id: number): Promise<Post | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`SELECT * FROM posts WHERE id = ${id}`;
      return result.rows[0] || null;
    });
  }

  async getPostsByIds(ids: number[]): Promise<Map<number, Post>> {
    if (ids.length === 0) return new Map();
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT * FROM posts WHERE id = ANY(${ids})
      `;
      const map = new Map<number, Post>();
      for (const post of result.rows) {
        map.set(post.id, post);
      }
      return map;
    });
  }

  async getPostByPublicId(publicId: string): Promise<Post | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`SELECT * FROM posts WHERE public_id::text = ${publicId}`;
      return result.rows[0] || null;
    });
  }

  async getPostByUri(uri: string): Promise<Post | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`SELECT * FROM posts WHERE uri = ${uri}`;
      return result.rows[0] || null;
    });
  }

  async getPostsByActor(actorId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT * FROM posts
        WHERE actor_id = ${actorId} AND in_reply_to_id IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getRepliesByActor(actorId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT * FROM posts
        WHERE actor_id = ${actorId} AND in_reply_to_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getHomeFeed(actorId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN follows f ON p.actor_id = f.following_id
        WHERE f.follower_id = ${actorId} AND p.in_reply_to_id IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getPublicTimeline(limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN actors a ON p.actor_id = a.id
        WHERE a.user_id IS NOT NULL AND p.in_reply_to_id IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  // ============ Feed methods with actor JOIN (optimized) ============

  private parsePostWithActor(row: Record<string, unknown>): PostWithActor {
    return {
      id: row.id as number,
      public_id: row.public_id as string,
      uri: row.uri as string,
      actor_id: row.actor_id as number,
      content: row.content as string,
      url: row.url as string | null,
      in_reply_to_id: row.in_reply_to_id as number | null,
      addressed_to: (row.addressed_to as string[]) || [],
      likes_count: row.likes_count as number,
      sensitive: row.sensitive as boolean,
      link_preview: row.link_preview as LinkPreview | null,
      video_embed: row.video_embed as VideoEmbed | null,
      created_at: String(row.created_at),
      author: {
        id: row.author_id as number,
        public_id: row.author_public_id as string,
        uri: row.author_uri as string,
        handle: row.author_handle as string,
        name: row.author_name as string | null,
        bio: row.author_bio as string | null,
        avatar_url: row.author_avatar_url as string | null,
        inbox_url: row.author_inbox_url as string,
        shared_inbox_url: row.author_shared_inbox_url as string | null,
        url: row.author_url as string | null,
        user_id: row.author_user_id as number | null,
        actor_type: (row.author_actor_type as "Person" | "Group") || "Person",
        created_at: String(row.author_created_at),
      },
    };
  }

  private readonly postWithActorSelect = `
    p.id, p.public_id, p.uri, p.actor_id, p.content, p.url, p.in_reply_to_id, p.addressed_to, p.likes_count, p.sensitive, p.link_preview, p.video_embed, p.created_at,
    a.id as author_id, a.public_id as author_public_id, a.uri as author_uri, a.handle as author_handle, a.name as author_name,
    a.bio as author_bio, a.avatar_url as author_avatar_url, a.inbox_url as author_inbox_url,
    a.shared_inbox_url as author_shared_inbox_url, a.url as author_url, a.user_id as author_user_id,
    a.actor_type as author_actor_type, a.created_at as author_created_at
  `;

  async getPublicTimelineWithActor(limit = 20, before?: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE a.user_id IS NOT NULL AND p.in_reply_to_id IS NULL AND p.id < $1
           ORDER BY p.id DESC LIMIT $2`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE a.user_id IS NOT NULL AND p.in_reply_to_id IS NULL
           ORDER BY p.id DESC LIMIT $1`;
      const params = before ? [before, limit] : [limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getHotPosts(limit = 10): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject(`
        SELECT DISTINCT ON (p.hot_score, p.id) ${this.postWithActorSelect} FROM (
          -- Regular posts with engagement
          SELECT p.id FROM posts p
          WHERE p.in_reply_to_id IS NULL AND p.hot_score > 0

          UNION

          -- Approved community posts with engagement
          SELECT p.id FROM posts p
          JOIN community_posts cp ON p.id = cp.post_id
          WHERE cp.status = 'approved' AND p.in_reply_to_id IS NULL AND p.hot_score > 0
        ) AS post_ids
        JOIN posts p ON p.id = post_ids.id
        JOIN actors a ON p.actor_id = a.id
        ORDER BY p.hot_score DESC, p.id DESC LIMIT $1
      `, [limit]);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getHomeFeedWithActor(actorId: number, limit = 20, before?: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      // Combine posts from followed users AND approved posts from joined communities
      const baseQuery = `
        SELECT DISTINCT ON (p.id) ${this.postWithActorSelect} FROM (
          -- Posts from followed users (Person actors)
          SELECT p.id FROM posts p
          JOIN follows f ON p.actor_id = f.following_id
          JOIN actors following_actor ON f.following_id = following_actor.id
          WHERE f.follower_id = $1 AND p.in_reply_to_id IS NULL
            AND following_actor.actor_type = 'Person'
            ${before ? 'AND p.id < $2' : ''}

          UNION

          -- Approved posts from joined communities (Group actors)
          SELECT p.id FROM posts p
          JOIN community_posts cp ON p.id = cp.post_id
          JOIN follows f ON cp.community_id = f.following_id
          WHERE f.follower_id = $1 AND cp.status = 'approved' AND p.in_reply_to_id IS NULL
            ${before ? 'AND p.id < $2' : ''}
        ) AS post_ids
        JOIN posts p ON p.id = post_ids.id
        JOIN actors a ON p.actor_id = a.id
        ORDER BY p.id DESC
        LIMIT ${before ? '$3' : '$2'}
      `;
      const params = before ? [actorId, before, limit] : [actorId, limit];
      const result = await client.queryObject(baseQuery, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getPostsByActorWithActor(actorId: number, limit = 20, before?: number, sort: 'new' | 'hot' = 'new'): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const orderBy = sort === 'hot' ? 'p.hot_score DESC, p.id DESC' : 'p.id DESC';
      const query = before
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.actor_id = $1 AND p.in_reply_to_id IS NULL AND p.id < $2
           ORDER BY ${orderBy} LIMIT $3`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.actor_id = $1 AND p.in_reply_to_id IS NULL
           ORDER BY ${orderBy} LIMIT $2`;
      const params = before ? [actorId, before, limit] : [actorId, limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getRepliesByActorWithActor(actorId: number, limit = 20, before?: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.actor_id = $1 AND p.in_reply_to_id IS NOT NULL AND p.id < $2
           ORDER BY p.id DESC LIMIT $3`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.actor_id = $1 AND p.in_reply_to_id IS NOT NULL
           ORDER BY p.id DESC LIMIT $2`;
      const params = before ? [actorId, before, limit] : [actorId, limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getRepliesWithActor(postId: number, limit = 20, after?: number, sort: 'new' | 'hot' = 'new', opActorId?: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const secondaryOrder = sort === 'hot' ? 'p.hot_score DESC, p.id DESC' : 'p.id DESC';
      // Sort OP replies first, then by selected sort
      const orderBy = opActorId
        ? `(p.actor_id = ${opActorId}) DESC, ${secondaryOrder}`
        : secondaryOrder;
      const query = after
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.in_reply_to_id = $1 AND p.id > $2
           ORDER BY ${orderBy} LIMIT $3`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           WHERE p.in_reply_to_id = $1
           ORDER BY ${orderBy} LIMIT $2`;
      const params = after ? [postId, after, limit] : [postId, limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getHashtagsForPosts(postIds: number[]): Promise<Map<number, string[]>> {
    if (postIds.length === 0) return new Map();
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number; name: string }>`
        SELECT ph.post_id, h.name
        FROM post_hashtags ph
        JOIN hashtags h ON ph.hashtag_id = h.id
        WHERE ph.post_id = ANY(${postIds})
      `;
      const map = new Map<number, string[]>();
      for (const row of result.rows) {
        const existing = map.get(row.post_id) || [];
        existing.push(row.name);
        map.set(row.post_id, existing);
      }
      return map;
    });
  }

  async getLikedPostIds(actorId: number, postIds: number[]): Promise<Set<number>> {
    if (postIds.length === 0) return new Set();
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number }>`
        SELECT post_id FROM likes WHERE actor_id = ${actorId} AND post_id = ANY(${postIds})
      `;
      return new Set(result.rows.map(r => r.post_id));
    });
  }

  async getBoostedPostIds(actorId: number, postIds: number[]): Promise<Set<number>> {
    if (postIds.length === 0) return new Set();
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number }>`
        SELECT post_id FROM boosts WHERE actor_id = ${actorId} AND post_id = ANY(${postIds})
      `;
      return new Set(result.rows.map(r => r.post_id));
    });
  }

  async getPinnedPostIds(actorId: number, postIds: number[]): Promise<Set<number>> {
    if (postIds.length === 0) return new Set();
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number }>`
        SELECT post_id FROM pinned_posts WHERE actor_id = ${actorId} AND post_id = ANY(${postIds})
      `;
      return new Set(result.rows.map(r => r.post_id));
    });
  }

  async getRepliesCounts(postIds: number[]): Promise<Map<number, number>> {
    if (postIds.length === 0) return new Map();
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number; count: bigint }>`
        SELECT in_reply_to_id as post_id, COUNT(*) as count
        FROM posts
        WHERE in_reply_to_id = ANY(${postIds})
        GROUP BY in_reply_to_id
      `;
      const map = new Map<number, number>();
      for (const row of result.rows) {
        map.set(row.post_id, Number(row.count));
      }
      return map;
    });
  }

  async getPinnedPostsWithActor(actorId: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject(`
        SELECT ${this.postWithActorSelect}
        FROM posts p
        JOIN actors a ON p.actor_id = a.id
        JOIN pinned_posts pp ON p.id = pp.post_id
        WHERE pp.actor_id = $1
        ORDER BY pp.pinned_at DESC
      `, [actorId]);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getBoostedPostsWithActor(actorId: number, limit = 20, before?: number): Promise<PostWithActor[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           JOIN boosts b ON p.id = b.post_id
           WHERE b.actor_id = $1 AND p.id < $2
           ORDER BY p.id DESC LIMIT $3`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           JOIN boosts b ON p.id = b.post_id
           WHERE b.actor_id = $1
           ORDER BY p.id DESC LIMIT $2`;
      const params = before ? [actorId, before, limit] : [actorId, limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async getPostsByHashtagWithActor(hashtagName: string, limit = 20, before?: number, sort: 'new' | 'hot' = 'new'): Promise<PostWithActor[]> {
    const normalized = hashtagName.toLowerCase().replace(/^#/, "");
    const orderBy = sort === 'hot' ? 'p.hot_score DESC, p.id DESC' : 'p.id DESC';
    return this.query(async (client) => {
      const query = before
        ? `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           JOIN post_hashtags ph ON p.id = ph.post_id
           JOIN hashtags h ON ph.hashtag_id = h.id
           WHERE h.name = $1 AND p.id < $2
           ORDER BY ${orderBy} LIMIT $3`
        : `SELECT ${this.postWithActorSelect} FROM posts p JOIN actors a ON p.actor_id = a.id
           JOIN post_hashtags ph ON p.id = ph.post_id
           JOIN hashtags h ON ph.hashtag_id = h.id
           WHERE h.name = $1
           ORDER BY ${orderBy} LIMIT $2`;
      const params = before ? [normalized, before, limit] : [normalized, limit];
      const result = await client.queryObject(query, params);
      return result.rows.map(row => this.parsePostWithActor(row as Record<string, unknown>));
    });
  }

  async deletePost(id: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        // Get the post to check if it's a reply
        const result = await client.queryObject<{ in_reply_to_id: number | null }>`
          SELECT in_reply_to_id FROM posts WHERE id = ${id}
        `;
        const post = result.rows[0];

        // Delete the post
        await client.queryArray`DELETE FROM posts WHERE id = ${id}`;

        // Decrement parent's replies_count if this was a reply
        if (post?.in_reply_to_id) {
          await client.queryArray`UPDATE posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = ${post.in_reply_to_id}`;
        }
        await client.queryArray`COMMIT`;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  /**
   * Delete a post and ALL its replies recursively (cascade delete).
   * Returns the URIs of all deleted posts (for ActivityPub) and their media URLs.
   */
  async cascadeDeletePost(id: number): Promise<{ deletedUris: string[]; deletedCount: number; mediaUrls: string[] }> {
    return this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        // Get the post to find its parent (for updating replies_count)
        const parentResult = await client.queryObject<{ in_reply_to_id: number | null }>`
          SELECT in_reply_to_id FROM posts WHERE id = ${id}
        `;
        const parentId = parentResult.rows[0]?.in_reply_to_id;

        // Find all descendant posts using recursive CTE - get id and uri for ActivityPub
        const descendantsResult = await client.queryObject<{ id: number; uri: string }>`
          WITH RECURSIVE descendants AS (
            SELECT id, uri FROM posts WHERE id = ${id}
            UNION ALL
            SELECT p.id, p.uri FROM posts p
            JOIN descendants d ON p.in_reply_to_id = d.id
          )
          SELECT id, uri FROM descendants
        `;
        const allPosts = descendantsResult.rows;

        if (allPosts.length === 0) {
          await client.queryArray`ROLLBACK`;
          return { deletedUris: [], deletedCount: 0, mediaUrls: [] };
        }

        const allPostIds = allPosts.map(r => r.id);
        const deletedUris = allPosts.map(r => r.uri);

        // Collect media URLs before deleting
        const mediaResult = await client.queryObject<{ url: string }>`
          SELECT url FROM media WHERE post_id = ANY(${allPostIds})
        `;
        const mediaUrls = mediaResult.rows.map(r => r.url);

        // Delete posts in reverse order (leaf nodes first) to satisfy FK constraints
        // The recursive CTE returns them in traversal order, so we reverse
        const reversedIds = [...allPostIds].reverse();
        for (const postId of reversedIds) {
          await client.queryArray`DELETE FROM posts WHERE id = ${postId}`;
        }

        // Update parent's replies_count if the root post was a reply
        if (parentId) {
          await client.queryArray`UPDATE posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = ${parentId}`;
        }

        await client.queryArray`COMMIT`;
        return { deletedUris, deletedCount: allPosts.length, mediaUrls };
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  // ============ Media ============

  async createMedia(postId: number, url: string, mediaType: string, altText: string | null, width: number | null, height: number | null): Promise<Media> {
    return this.query(async (client) => {
      const result = await client.queryObject<Media>`
        INSERT INTO media (post_id, url, media_type, alt_text, width, height)
        VALUES (${postId}, ${url}, ${mediaType}, ${altText}, ${width}, ${height})
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  async getMediaByPostId(postId: number): Promise<Media[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Media>`
        SELECT * FROM media WHERE post_id = ${postId} ORDER BY id ASC
      `;
      return result.rows;
    });
  }

  async getMediaForPosts(postIds: number[]): Promise<Map<number, Media[]>> {
    if (postIds.length === 0) return new Map();
    return this.query(async (client) => {
      const result = await client.queryObject<Media>`
        SELECT * FROM media WHERE post_id = ANY(${postIds}) ORDER BY id ASC
      `;
      const map = new Map<number, Media[]>();
      for (const row of result.rows) {
        const existing = map.get(row.post_id) || [];
        existing.push(row);
        map.set(row.post_id, existing);
      }
      return map;
    });
  }

  async getReplies(postId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT * FROM posts WHERE in_reply_to_id = ${postId}
        ORDER BY created_at ASC LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getRepliesCount(postId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM posts WHERE in_reply_to_id = ${postId}
      `;
      return Number(result.rows[0].count);
    });
  }

  // ============ Hashtags ============

  async getOrCreateHashtag(name: string): Promise<Hashtag> {
    const normalized = name.toLowerCase().replace(/^#/, "");
    return this.query(async (client) => {
      await client.queryArray`INSERT INTO hashtags (name) VALUES (${normalized}) ON CONFLICT DO NOTHING`;
      const result = await client.queryObject<Hashtag>`SELECT * FROM hashtags WHERE name = ${normalized}`;
      return result.rows[0];
    });
  }

  async addPostHashtag(postId: number, hashtagId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (${postId}, ${hashtagId})
        ON CONFLICT DO NOTHING
      `;
    });
  }

  async getPostHashtags(postId: number): Promise<Hashtag[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Hashtag>`
        SELECT h.* FROM hashtags h
        JOIN post_hashtags ph ON h.id = ph.hashtag_id
        WHERE ph.post_id = ${postId}
      `;
      return result.rows;
    });
  }

  async getPostsByHashtag(hashtagName: string, limit = 50): Promise<Post[]> {
    const normalized = hashtagName.toLowerCase().replace(/^#/, "");
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN post_hashtags ph ON p.id = ph.post_id
        JOIN hashtags h ON ph.hashtag_id = h.id
        WHERE h.name = ${normalized}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getPopularTags(limit = 5): Promise<{ name: string; count: number }[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ name: string; count: bigint }>`
        SELECT h.name, COUNT(ph.post_id) as count
        FROM hashtags h
        JOIN post_hashtags ph ON h.id = ph.hashtag_id
        GROUP BY h.id
        ORDER BY count DESC
        LIMIT ${limit}
      `;
      return result.rows.map(r => ({ name: r.name, count: Number(r.count) }));
    });
  }

  async searchTags(query: string, limit = 10): Promise<{ name: string; count: number }[]> {
    const normalized = query.toLowerCase().replace(/^#/, "");
    if (!normalized) return [];
    return this.query(async (client) => {
      const pattern = `%${normalized}%`;
      const startPattern = `${normalized}%`;
      const result = await client.queryObject<{ name: string; count: bigint }>`
        SELECT h.name, COUNT(ph.post_id) as count
        FROM hashtags h
        LEFT JOIN post_hashtags ph ON h.id = ph.hashtag_id
        WHERE h.name ILIKE ${pattern}
        GROUP BY h.id
        ORDER BY
          CASE WHEN h.name = ${normalized} THEN 0 ELSE 1 END,
          CASE WHEN h.name ILIKE ${startPattern} THEN 0 ELSE 1 END,
          count DESC,
          h.name ASC
        LIMIT ${limit}
      `;
      return result.rows.map(r => ({ name: r.name, count: Number(r.count) }));
    });
  }

  async getTrendingTags(limit = 10, hoursBack = 48): Promise<{ name: string; count: number }[]> {
    return this.query(async (client) => {
      // Calculate cutoff date in JavaScript since INTERVAL doesn't work with parameters
      const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      const result = await client.queryObject<{ name: string; count: bigint }>`
        SELECT h.name, COUNT(*) as count
        FROM hashtags h
        JOIN post_hashtags ph ON h.id = ph.hashtag_id
        JOIN posts p ON ph.post_id = p.id
        WHERE p.created_at >= ${cutoffDate}
        GROUP BY h.id
        ORDER BY count DESC, h.name ASC
        LIMIT ${limit}
      `;
      return result.rows.map(r => ({ name: r.name, count: Number(r.count) }));
    });
  }

  // ============ Likes ============

  async addLike(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        const result = await client.queryObject<{ id: number }>`
          INSERT INTO likes (actor_id, post_id) VALUES (${actorId}, ${postId})
          ON CONFLICT DO NOTHING
          RETURNING id
        `;
        if (result.rows.length > 0) {
          await client.queryArray`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}`;
        }
        await client.queryArray`COMMIT`;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  async removeLike(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        const result = await client.queryObject<{ id: number }>`
          DELETE FROM likes WHERE actor_id = ${actorId} AND post_id = ${postId} RETURNING id
        `;
        if (result.rows.length > 0) {
          await client.queryArray`UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ${postId}`;
        }
        await client.queryArray`COMMIT`;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  async hasLiked(actorId: number, postId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM likes WHERE actor_id = ${actorId} AND post_id = ${postId}
      `;
      return result.rows.length > 0;
    });
  }

  async getLikesCount(postId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM likes WHERE post_id = ${postId}
      `;
      return Number(result.rows[0].count);
    });
  }

  async getPostLikers(postId: number): Promise<Actor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN likes l ON a.id = l.actor_id
        WHERE l.post_id = ${postId}
        ORDER BY l.created_at DESC
      `;
      return result.rows;
    });
  }

  async getLikedPosts(actorId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN likes l ON p.id = l.post_id
        WHERE l.actor_id = ${actorId}
        ORDER BY l.created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getLikedPostsCount(actorId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM likes WHERE actor_id = ${actorId}
      `;
      return Number(result.rows[0].count);
    });
  }

  // ============ Boosts ============

  async addBoost(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        const result = await client.queryObject<{ id: number }>`
          INSERT INTO boosts (actor_id, post_id) VALUES (${actorId}, ${postId})
          ON CONFLICT DO NOTHING
          RETURNING id
        `;
        if (result.rows.length > 0) {
          await client.queryArray`UPDATE posts SET boosts_count = boosts_count + 1 WHERE id = ${postId}`;
        }
        await client.queryArray`COMMIT`;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  async removeBoost(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        const result = await client.queryObject<{ id: number }>`
          DELETE FROM boosts WHERE actor_id = ${actorId} AND post_id = ${postId} RETURNING id
        `;
        if (result.rows.length > 0) {
          await client.queryArray`UPDATE posts SET boosts_count = GREATEST(0, boosts_count - 1) WHERE id = ${postId}`;
        }
        await client.queryArray`COMMIT`;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  async hasBoosted(actorId: number, postId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM boosts WHERE actor_id = ${actorId} AND post_id = ${postId}
      `;
      return result.rows.length > 0;
    });
  }

  async getBoostsCount(postId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM boosts WHERE post_id = ${postId}
      `;
      return Number(result.rows[0].count);
    });
  }

  async getPostBoosters(postId: number): Promise<Actor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN boosts b ON a.id = b.actor_id
        WHERE b.post_id = ${postId}
        ORDER BY b.created_at DESC
      `;
      return result.rows;
    });
  }

  async getBoostedPosts(actorId: number, limit = 50): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN boosts b ON p.id = b.post_id
        WHERE b.actor_id = ${actorId}
        ORDER BY b.created_at DESC
        LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  // ============ Pinned Posts ============

  async pinPost(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO pinned_posts (actor_id, post_id) VALUES (${actorId}, ${postId})
        ON CONFLICT DO NOTHING
      `;
    });
  }

  async unpinPost(actorId: number, postId: number): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`DELETE FROM pinned_posts WHERE actor_id = ${actorId} AND post_id = ${postId}`;
    });
  }

  async isPinned(actorId: number, postId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM pinned_posts WHERE actor_id = ${actorId} AND post_id = ${postId}
      `;
      return result.rows.length > 0;
    });
  }

  async getPinnedPosts(actorId: number): Promise<Post[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Post>`
        SELECT p.* FROM posts p
        JOIN pinned_posts pp ON p.id = pp.post_id
        WHERE pp.actor_id = ${actorId}
        ORDER BY pp.pinned_at DESC
      `;
      return result.rows;
    });
  }

  async getPinnedPostsCount(actorId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM pinned_posts WHERE actor_id = ${actorId}
      `;
      return Number(result.rows[0].count);
    });
  }

  // ============ Sessions ============

  async createSession(userId: number): Promise<string> {
    return this.query(async (client) => {
      const token = crypto.randomUUID();
      await client.queryArray`INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})`;
      return token;
    });
  }

  async getSession(token: string): Promise<Session | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Session>`
        SELECT * FROM sessions WHERE token = ${token} AND expires_at > NOW()
      `;
      return result.rows[0] || null;
    });
  }

  async deleteSession(token: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`DELETE FROM sessions WHERE token = ${token}`;
    });
  }

  async cleanupExpiredSessions(): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        DELETE FROM sessions WHERE expires_at <= NOW()
      `;
      return result.rowCount ?? 0;
    });
  }

  // ============ Activities ============

  async storeActivity(activity: Omit<Activity, "id" | "created_at">): Promise<Activity> {
    return this.query(async (client) => {
      const result = await client.queryObject<Activity>`
        INSERT INTO activities (uri, type, actor_id, object_uri, object_type, raw_json, direction)
        VALUES (${activity.uri}, ${activity.type}, ${activity.actor_id}, ${activity.object_uri},
                ${activity.object_type}, ${activity.raw_json}, ${activity.direction})
        ON CONFLICT(uri) DO UPDATE SET raw_json = EXCLUDED.raw_json
        RETURNING *
      `;
      return result.rows[0];
    });
  }

  async getActivityByUri(uri: string): Promise<Activity | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Activity>`SELECT * FROM activities WHERE uri = ${uri}`;
      return result.rows[0] || null;
    });
  }

  async getActivitiesByActor(actorId: number, limit = 50): Promise<Activity[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Activity>`
        SELECT * FROM activities WHERE actor_id = ${actorId}
        ORDER BY created_at DESC LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  async getOutboxActivities(actorId: number, limit = 50): Promise<Activity[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Activity>`
        SELECT * FROM activities
        WHERE actor_id = ${actorId} AND direction = 'outbound'
        ORDER BY created_at DESC LIMIT ${limit}
      `;
      return result.rows;
    });
  }

  // ============ Stats (for NodeInfo) ============

  async getLocalUserCount(): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`SELECT COUNT(*) as count FROM users`;
      return Number(result.rows[0].count);
    });
  }

  async getLocalPostCount(): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM posts p
        JOIN actors a ON p.actor_id = a.id
        WHERE a.user_id IS NOT NULL
      `;
      return Number(result.rows[0].count);
    });
  }

  async getAnyLocalUser(): Promise<User | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<User>`
        SELECT * FROM users LIMIT 1
      `;
      return result.rows[0] || null;
    });
  }

  // ============ Reports ============

  async createReport(postId: number, reporterId: number, reason: string, details: string | null): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO reports (post_id, reporter_id, reason, details)
        VALUES (${postId}, ${reporterId}, ${reason}, ${details})
      `;
    });
  }
}
