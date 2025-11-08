'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function joinRoom(roomId: string, displayName: string) {
  // Create new participant - each browser session gets its own unique participant
  const participantId = uuidv4();
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const { data, error } = await supabaseAdmin
    .from('participants')
    .insert({
      id: participantId,
      room_id: roomId,
      display_name: displayName,
      color,
      weight: 1.0,
    })
    .select()
    .single();

  if (error) throw error;
  return { participantId, color };
}

