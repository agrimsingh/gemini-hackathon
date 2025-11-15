-- Add v0 Platform metadata columns to rooms
-- Run this in your Supabase SQL editor

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS v0_project_id TEXT,
  ADD COLUMN IF NOT EXISTS v0_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS v0_version_id TEXT,
  ADD COLUMN IF NOT EXISTS v0_deployment_id TEXT,
  ADD COLUMN IF NOT EXISTS v0_preview_url TEXT;

-- These fields let the backend link a room to the v0 Platform project/chat.


