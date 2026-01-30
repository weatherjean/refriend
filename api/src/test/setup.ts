/**
 * Integration test setup - auto-starts test database container
 *
 * Just run: deno task test:integration
 */

import { DB } from "../db.ts";
import { CommunityDB } from "../domains/communities/repository.ts";
import { createApiRoutes } from "../api-routes.ts";
import type { User, Actor, Post } from "../db.ts";

const TEST_DB_PORT = "5433";
const TEST_DB_USER = "riff_test";
const TEST_DB_PASS = "riff_test";
const TEST_DB_NAME = "riff_test";
const TEST_DATABASE_URL = `postgres://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:${TEST_DB_PORT}/${TEST_DB_NAME}`;
const CONTAINER_NAME = "riff-test-db";

let _db: DB | null = null;
let _communityDb: CommunityDB | null = null;
let _containerStarted = false;

/**
 * Start the test database container if not running
 */
async function ensureTestContainer(): Promise<void> {
  if (_containerStarted) return;

  // Check if container exists and is running
  const checkCmd = new Deno.Command("docker", {
    args: ["ps", "-q", "-f", `name=${CONTAINER_NAME}`],
    stdout: "piped",
    stderr: "piped",
  });
  const checkResult = await checkCmd.output();
  const isRunning = new TextDecoder().decode(checkResult.stdout).trim() !== "";

  if (!isRunning) {
    console.log("Starting test database container...");

    // Remove old container if exists
    const rmCmd = new Deno.Command("docker", {
      args: ["rm", "-f", CONTAINER_NAME],
      stdout: "null",
      stderr: "null",
    });
    await rmCmd.output();

    // Start new container
    const startCmd = new Deno.Command("docker", {
      args: [
        "run", "-d",
        "--name", CONTAINER_NAME,
        "-e", `POSTGRES_USER=${TEST_DB_USER}`,
        "-e", `POSTGRES_PASSWORD=${TEST_DB_PASS}`,
        "-e", `POSTGRES_DB=${TEST_DB_NAME}`,
        "-p", `${TEST_DB_PORT}:5432`,
        "--tmpfs", "/var/lib/postgresql/data",
        "postgres:16-alpine",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const startResult = await startCmd.output();
    if (!startResult.success) {
      throw new Error(`Failed to start test container: ${new TextDecoder().decode(startResult.stderr)}`);
    }

    // Wait for postgres to be ready
    console.log("Waiting for database to be ready...");
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const readyCmd = new Deno.Command("docker", {
        args: ["exec", CONTAINER_NAME, "pg_isready", "-U", TEST_DB_USER],
        stdout: "null",
        stderr: "null",
      });
      const readyResult = await readyCmd.output();
      if (readyResult.success) {
        console.log("Database ready!");
        break;
      }
    }
  }

  _containerStarted = true;
}

/**
 * Get or create the test database connection
 */
export async function getTestDB(): Promise<DB> {
  await ensureTestContainer();

  if (!_db) {
    _db = new DB(TEST_DATABASE_URL);
    // Initialize schema from file
    const schemaPath = new URL("../../schema.pg.sql", import.meta.url).pathname;
    await _db.init(schemaPath);
  }
  return _db;
}

/**
 * Get or create the test community database
 */
export async function getTestCommunityDB(): Promise<CommunityDB> {
  if (!_communityDb) {
    const db = await getTestDB();
    _communityDb = new CommunityDB(db.getPool());
  }
  return _communityDb;
}

/**
 * Create the API instance with real database
 */
export async function createTestApi() {
  const db = await getTestDB();
  const communityDb = await getTestCommunityDB();

  // Mock federation - ActivityPub federation tested separately
  const mockFederation = {
    createContext: (_req: Request, _data: unknown) => ({
      getActorUri: (username: string) => new URL(`https://test.local/users/${username}`),
      getFollowersUri: (username: string) => new URL(`https://test.local/users/${username}/followers`),
      sendActivity: async () => {},
    }),
  };

  return createApiRoutes(db as any, mockFederation as any, communityDb);
}

/**
 * Clean all data from test database (run between tests)
 */
export async function cleanDatabase(): Promise<void> {
  const db = await getTestDB();
  const pool = db.getPool();
  const client = await pool.connect();

  try {
    // Get all tables and truncate them
    const result = await client.queryObject<{ tablename: string }>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
    `;

    if (result.rows.length > 0) {
      const tables = result.rows.map(r => r.tablename).join(", ");
      await client.queryArray(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    client.release();
  }
}

/**
 * Close test database connection
 */
export async function closeTestDB(): Promise<void> {
  if (_db) {
    await _db.close();
    _db = null;
    _communityDb = null;
  }
}

/**
 * Stop and remove the test container (optional cleanup)
 */
export async function stopTestContainer(): Promise<void> {
  const cmd = new Deno.Command("docker", {
    args: ["rm", "-f", CONTAINER_NAME],
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
  _containerStarted = false;
}

// ============ Test Factories ============

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltStr = btoa(String.fromCharCode(...salt));
  return `${saltStr}:${hash}`;
}

export async function createTestUser(
  data: { username?: string; email?: string; password?: string } = {}
): Promise<{ user: User; actor: Actor; password: string }> {
  const db = await getTestDB();
  const username = data.username || `testuser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const email = data.email || `${username}@test.local`;
  const password = data.password || "password123";

  const passwordHash = await hashPassword(password);
  const user = await db.createUser(username, passwordHash, email);

  const domain = "test.local";
  const actor = await db.createActor({
    uri: `https://${domain}/users/${username}`,
    handle: `@${username}@${domain}`,
    name: null,
    bio: null,
    avatar_url: null,
    inbox_url: `https://${domain}/users/${username}/inbox`,
    shared_inbox_url: `https://${domain}/inbox`,
    url: `https://${domain}/@${username}`,
    user_id: user.id,
    actor_type: "Person",
  });

  return { user, actor, password };
}

export async function createTestPost(
  actor: Actor,
  data: { content?: string; in_reply_to_id?: number; sensitive?: boolean } = {}
): Promise<Post> {
  const db = await getTestDB();
  const content = data.content || "Test post content";
  const postId = crypto.randomUUID();
  const username = actor.handle?.split("@")[1] || "unknown";
  const domain = "test.local";

  const post = await db.createPost({
    uri: `https://${domain}/users/${username}/posts/${postId}`,
    actor_id: actor.id,
    content: `<p>${content}</p>`,
    url: `https://${domain}/@${username}/posts/${postId}`,
    in_reply_to_id: data.in_reply_to_id || null,
    sensitive: data.sensitive || false,
  });

  return post;
}

export async function createRemoteActor(data?: {
  handle?: string;
  name?: string;
  actor_type?: "Person" | "Group";
  uri?: string;
  inbox_url?: string;
}): Promise<Actor> {
  const db = await getTestDB();
  const ts = Date.now();
  const handle = data?.handle || `@remote_${ts}@remote.example`;
  const uri = data?.uri || `https://remote.example/users/remote_${ts}`;
  return db.createActor({
    uri,
    handle,
    name: data?.name || null,
    bio: null,
    avatar_url: null,
    inbox_url: data?.inbox_url || `${uri}/inbox`,
    shared_inbox_url: "https://remote.example/inbox",
    url: uri,
    user_id: null,
    actor_type: data?.actor_type || "Person",
  });
}

// ============ Test Request Helper ============

export async function testRequest(
  api: Awaited<ReturnType<typeof createTestApi>>,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    cookie?: string;
    csrfToken?: string;
  } = {}
): Promise<Response> {
  const url = `http://test.local${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  if (options.cookie) {
    init.headers = { ...init.headers, Cookie: options.cookie };
  }

  // Add CSRF token for mutation requests
  if (options.csrfToken && ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())) {
    init.headers = { ...init.headers, "X-CSRF-Token": options.csrfToken };
  }

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const req = new Request(url, init);
  return await api.fetch(req);
}

export function getSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/session=([^;]+)/);
  return match ? `session=${match[1]}` : null;
}

export interface AuthSession {
  cookie: string;
  csrfToken: string;
}

export async function loginUser(
  api: Awaited<ReturnType<typeof createTestApi>>,
  email: string,
  password: string
): Promise<AuthSession> {
  const res = await testRequest(api, "POST", "/auth/login", {
    body: { email, password },
  });
  const cookie = getSessionCookie(res);
  if (!cookie) {
    throw new Error(`Login failed: ${await res.text()}`);
  }
  const data = await res.json();
  return { cookie, csrfToken: data.csrfToken };
}

export async function createTestCommunity(
  creatorActor: { id: number },
  data: { name?: string; bio?: string; require_approval?: boolean } = {}
) {
  const communityDb = await getTestCommunityDB();
  const name = data.name || `testcommunity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const domain = "test.local";

  const community = await communityDb.createCommunity(name, domain, creatorActor.id, {
    bio: data.bio,
    requireApproval: data.require_approval,
  });

  return community;
}
