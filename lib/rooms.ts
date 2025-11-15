'use server';

import { supabaseAdmin } from './supabase/server';

export type RoomV0Metadata = {
  v0_project_id?: string | null;
  v0_chat_id?: string | null;
  v0_version_id?: string | null;
  v0_deployment_id?: string | null;
  v0_preview_url?: string | null;
};

export async function getRoomV0Metadata(
  roomId: string
): Promise<RoomV0Metadata | null> {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select(
      'v0_project_id, v0_chat_id, v0_version_id, v0_deployment_id, v0_preview_url'
    )
    .eq('id', roomId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertRoomV0Metadata(
  roomId: string,
  metadata: Partial<RoomV0Metadata>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('rooms')
    .update(metadata)
    .eq('id', roomId);

  if (error) {
    throw error;
  }
}

