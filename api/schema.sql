-- Refriend v3 Schema - Federation-first design following Fedify patterns

-- Users: Local accounts that can authenticate
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE CHECK (username GLOB '[a-z0-9_]*' AND length(username) <= 50),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Actors: Both local users and remote ActivityPub actors
-- This is the core ActivityPub entity
CREATE TABLE IF NOT EXISTS actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,                    -- ActivityPub ID (e.g., https://example.com/users/alice)
  handle TEXT NOT NULL UNIQUE,                 -- @username@domain format
  name TEXT,                                   -- Display name
  bio TEXT,                                    -- Profile bio/summary (HTML)
  avatar_url TEXT,                             -- Profile picture URL
  inbox_url TEXT NOT NULL,                     -- Personal inbox URL
  shared_inbox_url TEXT,                       -- Shared inbox URL (optional)
  url TEXT,                                    -- Profile page URL
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,  -- NULL for remote actors
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Keys: Cryptographic key pairs for local actors (for HTTP signatures)
CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('RSASSA-PKCS1-v1_5', 'Ed25519')),
  private_key TEXT NOT NULL,                   -- JWK format
  public_key TEXT NOT NULL,                    -- JWK format
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, type)
);

-- Follows: Who follows whom (works for both local and remote)
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);

-- Posts: Notes/statuses (both local and remote)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,                    -- ActivityPub ID
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  content TEXT NOT NULL,                       -- HTML content
  url TEXT,                                    -- Web URL for the post
  in_reply_to_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,  -- For replies
  likes_count INTEGER NOT NULL DEFAULT 0,     -- Denormalized for performance
  sensitive INTEGER NOT NULL DEFAULT 0,       -- Content warning/sensitive media flag
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Media: Attachments for posts (images, etc.)
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image/webp',
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id);

-- Hashtags: Tags used in posts
CREATE TABLE IF NOT EXISTS hashtags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (name GLOB '[a-zA-Z0-9_]*')
);

-- Post-Hashtag junction table
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

-- Likes: Who liked which post (ActivityPub Like activity)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (actor_id, post_id)
);

-- Boosts: Who boosted which post (ActivityPub Announce activity)
CREATE TABLE IF NOT EXISTS boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (actor_id, post_id)
);

-- Pinned posts: Featured/pinned posts for each actor
CREATE TABLE IF NOT EXISTS pinned_posts (
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, post_id)
);

-- Sessions: For web authentication
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activities: Store all ActivityPub activities for outbox and audit trail
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,                    -- ActivityPub activity ID
  type TEXT NOT NULL,                          -- Create, Like, Follow, Delete, Undo, Accept
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  object_uri TEXT,                             -- URI of the object (Note, Actor, or nested Activity)
  object_type TEXT,                            -- Note, Person, Like, Follow, etc.
  raw_json TEXT NOT NULL,                      -- Full activity JSON for outbox
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_actors_user_id ON actors(user_id);
CREATE INDEX IF NOT EXISTS idx_actors_handle ON actors(handle);
CREATE INDEX IF NOT EXISTS idx_posts_actor_id ON posts(actor_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_actor_id ON likes(actor_id);
CREATE INDEX IF NOT EXISTS idx_boosts_post_id ON boosts(post_id);
CREATE INDEX IF NOT EXISTS idx_boosts_actor_id ON boosts(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_direction ON activities(direction);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags(hashtag_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post ON post_hashtags(post_id);
