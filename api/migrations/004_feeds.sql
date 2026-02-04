CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE feeds (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_-]+$' AND length(slug) BETWEEN 1 AND 60),
  avatar_url TEXT,
  owner_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_feeds_owner ON feeds(owner_id);
CREATE INDEX idx_feeds_slug ON feeds(slug);
CREATE INDEX idx_feeds_name_trgm ON feeds USING GIN (name gin_trgm_ops);
CREATE INDEX idx_feeds_description_trgm ON feeds USING GIN (description gin_trgm_ops);

CREATE TABLE feed_moderators (
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feed_id, actor_id)
);

CREATE TABLE feed_posts (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  added_by_actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feed_id, post_id)
);
CREATE INDEX idx_feed_posts_feed_created ON feed_posts(feed_id, created_at DESC);
CREATE INDEX idx_feed_posts_post ON feed_posts(post_id);

CREATE TABLE feed_suggestions (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  suggested_by_actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feed_id, post_id, suggested_by_actor_id)
);
CREATE INDEX idx_feed_suggestions_pending ON feed_suggestions(feed_id, status) WHERE status = 'pending';
CREATE INDEX idx_feed_suggestions_post ON feed_suggestions(post_id);

CREATE TABLE feed_bookmarks (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, feed_id)
);
CREATE INDEX idx_feed_bookmarks_actor ON feed_bookmarks(actor_id);
