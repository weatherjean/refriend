ALTER TABLE posts ADD COLUMN quote_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_quote_post ON posts(quote_post_id) WHERE quote_post_id IS NOT NULL;
