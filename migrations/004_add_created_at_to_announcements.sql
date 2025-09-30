-- Add created_at column to announcements table
ALTER TABLE announcements
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();