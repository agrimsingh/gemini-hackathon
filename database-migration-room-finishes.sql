-- Create room_finishes table for tracking finish requests and final reports
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS room_finishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  requester_id UUID NOT NULL,
  approver_id UUID,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  final_report_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_room_finishes_room_id ON room_finishes(room_id);
CREATE INDEX IF NOT EXISTS idx_room_finishes_status ON room_finishes(status);
CREATE INDEX IF NOT EXISTS idx_room_finishes_created_at ON room_finishes(created_at DESC);

-- Enable realtime for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE room_finishes;

-- Grant permissions (adjust based on your RLS policies)
-- This allows service role to insert/select/update
-- Adjust as needed for your security model

