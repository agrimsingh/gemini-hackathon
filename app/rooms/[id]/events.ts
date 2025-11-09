'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { detectFinishIntent } from '@/lib/finishUtils';
import { requestFinish } from './finish';

export async function createPromptEvent(
  roomId: string,
  participantId: string,
  kind: 'text' | 'image' | 'audio',
  text?: string,
  payloadUrl?: string
) {
  const { data, error } = await supabaseAdmin
    .from('prompt_events')
    .insert({
      id: uuidv4(),
      room_id: roomId,
      participant_id: participantId,
      kind,
      text: text || null,
      payload_url: payloadUrl || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Natural language detection for finish intent
  if (kind === 'text' && text && detectFinishIntent(text)) {
    console.log('[Events] Detected finish intent in prompt:', text);
    // Attempt to auto-request finish (will fail gracefully if already requested)
    await requestFinish(roomId, participantId);
  }

  return data;
}

