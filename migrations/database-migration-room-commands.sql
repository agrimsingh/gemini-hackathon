-- Create room_commands table for storing Twitch-style command inputs
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS room_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_room_commands_room_id ON room_commands(room_id);
CREATE INDEX IF NOT EXISTS idx_room_commands_created_at ON room_commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_commands_room_created ON room_commands(room_id, created_at DESC);

-- Enable realtime for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE room_commands;

-- Grant permissions (adjust based on your RLS policies)
-- This allows service role to insert/select
-- Adjust as needed for your security model

