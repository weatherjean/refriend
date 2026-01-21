-- Riff Schema - PostgreSQL version

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users: Local accounts that can authenticate
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]+$' AND length(username) <= 50),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Actors: Both local users and remote ActivityPub actors
CREATE TABLE IF NOT EXISTS actors (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  uri TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  name TEXT,
  bio TEXT,
  avatar_url TEXT,
  inbox_url TEXT NOT NULL,
  shared_inbox_url TEXT,
  url TEXT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keys: Cryptographic key pairs for local actors
CREATE TABLE IF NOT EXISTS keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('RSASSA-PKCS1-v1_5', 'Ed25519')),
  private_key TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type),
  UNIQUE (actor_id, type),
  CHECK (user_id IS NOT NULL OR actor_id IS NOT NULL)
);

-- Follows: Who follows whom
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

-- Posts: Notes/statuses
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  uri TEXT NOT NULL UNIQUE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  url TEXT,
  in_reply_to_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  boosts_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  hot_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media: Attachments for posts
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image/webp',
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hashtags
CREATE TABLE IF NOT EXISTS hashtags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name ~ '^[a-zA-Z0-9_]+$')
);

-- Post-Hashtag junction
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

-- Likes
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, post_id)
);

-- Boosts
CREATE TABLE IF NOT EXISTS boosts (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, post_id)
);

-- Pinned posts
CREATE TABLE IF NOT EXISTS pinned_posts (
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, post_id)
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  uri TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  object_uri TEXT,
  object_type TEXT,
  raw_json TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('like', 'boost', 'follow', 'reply', 'mention')),
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  target_actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs queue
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Actor type for distinguishing Person vs Group (communities)
ALTER TABLE actors ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'Person'
  CHECK (actor_type IN ('Person', 'Group'));

-- Community settings (extends actors for Group type)
CREATE TABLE IF NOT EXISTS community_settings (
  actor_id INTEGER PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
  require_approval BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES actors(id) ON DELETE SET NULL
);

-- Community admins (owners and admins - followers are regular members)
CREATE TABLE IF NOT EXISTS community_admins (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, actor_id)
);

-- Community bans
CREATE TABLE IF NOT EXISTS community_bans (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by INTEGER REFERENCES actors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, actor_id)
);

-- Community posts with approval workflow
CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES actors(id) ON DELETE SET NULL,
  UNIQUE (community_id, post_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_actors_public_id ON actors(public_id);
CREATE INDEX IF NOT EXISTS idx_actors_user_id ON actors(user_id);
CREATE INDEX IF NOT EXISTS idx_actors_handle ON actors(handle);
CREATE INDEX IF NOT EXISTS idx_posts_public_id ON posts(public_id);
CREATE INDEX IF NOT EXISTS idx_posts_actor_id ON posts(actor_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_hot_score ON posts(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_in_reply_to ON posts(in_reply_to_id) WHERE in_reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_actor_replies ON posts(actor_id, created_at DESC) WHERE in_reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_actor_posts ON posts(actor_id, created_at DESC) WHERE in_reply_to_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows(following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_actor_id ON likes(actor_id);
CREATE INDEX IF NOT EXISTS idx_boosts_post_id ON boosts(post_id);
CREATE INDEX IF NOT EXISTS idx_boosts_actor_id ON boosts(actor_id);
CREATE INDEX IF NOT EXISTS idx_boosts_actor_created ON boosts(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_direction ON activities(direction);
CREATE INDEX IF NOT EXISTS idx_activities_uri ON activities(uri);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags(hashtag_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post ON post_hashtags(post_id);
CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(target_actor_id, read) WHERE read = FALSE;

-- Community indexes
CREATE INDEX IF NOT EXISTS idx_actors_type ON actors(actor_type);
CREATE INDEX IF NOT EXISTS idx_community_admins_community ON community_admins(community_id);
CREATE INDEX IF NOT EXISTS idx_community_admins_actor ON community_admins(actor_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_community ON community_bans(community_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_actor ON community_bans(actor_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_status ON community_posts(community_id, status);

-- Fuzzy search index for post content (pg_trgm)
CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON posts USING GIN (content gin_trgm_ops);
