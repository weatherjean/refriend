CREATE TABLE hashtag_bookmarks (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, hashtag_id)
);
CREATE INDEX idx_hashtag_bookmarks_actor ON hashtag_bookmarks(actor_id);
