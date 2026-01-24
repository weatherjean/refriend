import { Pool } from "postgres";

// Same interfaces as db.ts - unchanged
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

export interface Post {
  id: number;
  uri: string;
  actor_id: number;
  content: string;
  url: string | null;
  in_reply_to_id: number | null;
  likes_count: number;
  sensitive: boolean;
  created_at: string;
}

// ... other interfaces same as db.ts ...

export class DB {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool(connectionString, 10); // 10 connections
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

  // ============ Users ============

  async createUser(username: string, passwordHash: string): Promise<User> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<User>`
        INSERT INTO users (username, password_hash)
        VALUES (${username}, ${passwordHash})
        RETURNING *
      `;
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getUserById(id: number): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<User>`
        SELECT * FROM users WHERE id = ${id}
      `;
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<User>`
        SELECT * FROM users WHERE username = ${username}
      `;
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // ============ Posts ============

  async createPost(
    actorId: number,
    content: string,
    uri: string,
    inReplyToId: number | null = null,
    sensitive: boolean = false
  ): Promise<Post> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<Post>`
        INSERT INTO posts (actor_id, content, uri, in_reply_to_id, sensitive)
        VALUES (${actorId}, ${content}, ${uri}, ${inReplyToId}, ${sensitive})
        RETURNING *
      `;
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getPostById(id: number): Promise<Post | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<Post>`
        SELECT * FROM posts WHERE id = ${id}
      `;
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // ============ Jobs Queue ============

  async enqueueJob(type: string, payload: unknown, delayMs = 0): Promise<void> {
    const client = await this.pool.connect();
    const runAt = delayMs > 0
      ? new Date(Date.now() + delayMs).toISOString()
      : new Date().toISOString();
    try {
      await client.queryArray`
        INSERT INTO jobs (type, payload, run_at)
        VALUES (${type}, ${JSON.stringify(payload)}, ${runAt})
      `;
    } finally {
      client.release();
    }
  }

  async dequeueJob(): Promise<{ id: number; type: string; payload: unknown } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<{ id: number; type: string; payload: unknown }>`
        UPDATE jobs SET status = 'processing', attempts = attempts + 1
        WHERE id = (
          SELECT id FROM jobs
          WHERE status = 'pending' AND run_at <= NOW()
          ORDER BY run_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, payload
      `;
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async completeJob(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.queryArray`DELETE FROM jobs WHERE id = ${id}`;
    } finally {
      client.release();
    }
  }

  async failJob(id: number, maxAttempts = 5): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.queryArray`
        UPDATE jobs SET
          status = CASE WHEN attempts >= ${maxAttempts} THEN 'failed' ELSE 'pending' END,
          run_at = NOW() + INTERVAL '1 minute' * attempts
        WHERE id = ${id}
      `;
    } finally {
      client.release();
    }
  }
}

// Usage:
// const db = new DB(Deno.env.get("DATABASE_URL")!);
// await db.init("./schema.pg.sql");
