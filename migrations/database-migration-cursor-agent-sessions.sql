-- Add cursor_agent_session_id column to rooms table
-- Run this in your Supabase SQL editor

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cursor_agent_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rooms_cursor_agent_session ON rooms(cursor_agent_session_id) WHERE cursor_agent_session_id IS NOT NULL;

