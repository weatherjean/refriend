-- Add feed_id column to notifications for feed-related notifications
ALTER TABLE notifications ADD COLUMN feed_id INTEGER REFERENCES feeds(id) ON DELETE CASCADE;

-- Expand notification type constraint to include feed_mod and feed_unmod
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'boost', 'follow', 'reply', 'mention', 'feed_mod', 'feed_unmod'));
