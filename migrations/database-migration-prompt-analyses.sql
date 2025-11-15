-- Create prompt_analyses table for storing Gemini's conflict analysis with thinking traces
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS prompt_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  prompt_event_ids TEXT[] NOT NULL,
  analysis_json JSONB NOT NULL,
  thinking_trace TEXT NOT NULL
);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_prompt_analyses_room_id ON prompt_analyses(room_id);
CREATE INDEX IF NOT EXISTS idx_prompt_analyses_created_at ON prompt_analyses(created_at DESC);

-- Add optional analysis_id column to design_specs to link to the analysis
ALTER TABLE design_specs ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES prompt_analyses(id);

-- Enable realtime for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE prompt_analyses;

-- Grant permissions (adjust based on your RLS policies)
-- This allows service role to insert/select
-- Adjust as needed for your security model

