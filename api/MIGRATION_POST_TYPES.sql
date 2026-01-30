-- Migration: Add type and title columns to posts table
-- Supports Page (Lemmy community posts) and Article types alongside Note

ALTER TABLE posts ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Note';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title TEXT;

-- Add check constraint for valid types
ALTER TABLE posts ADD CONSTRAINT posts_type_check CHECK (type IN ('Note', 'Page', 'Article'));
