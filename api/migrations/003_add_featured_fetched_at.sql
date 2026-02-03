-- Add featured_fetched_at column to actors table if it doesn't exist
ALTER TABLE actors ADD COLUMN IF NOT EXISTS featured_fetched_at TIMESTAMPTZ;
