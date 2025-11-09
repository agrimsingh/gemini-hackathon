'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { generateFinalReport } from './reportGenerator';

export async function requestFinish(roomId: string, participantId: string) {
  // Check if there's already a pending request
  const { data: existing } = await supabaseAdmin
    .from('room_finishes')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .single();

  if (existing) {
    return { success: false, error: 'Finish request already pending' };
  }

  // Check if already finished
  const { data: finished } = await supabaseAdmin
    .from('room_finishes')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'approved')
    .single();

  if (finished) {
    return { success: false, error: 'Room already finished' };
  }

  // Create new finish request
  const { data, error } = await supabaseAdmin
    .from('room_finishes')
    .insert({
      room_id: roomId,
      requester_id: participantId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create finish request:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function approveFinish(roomId: string, participantId: string) {
  // Get the pending finish request
  const { data: finishRequest } = await supabaseAdmin
    .from('room_finishes')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .single();

  if (!finishRequest) {
    return { success: false, error: 'No pending finish request found' };
  }

  // Don't allow requester to approve their own request
  if (finishRequest.requester_id === participantId) {
    return { success: false, error: 'Cannot approve your own finish request' };
  }

  // Generate the final report
  console.log('[Finish] Generating final report...');
  const reportData = await generateFinalReport(roomId);

  // Update the finish request with approval and report data
  const { data, error } = await supabaseAdmin
    .from('room_finishes')
    .update({
      status: 'approved',
      approver_id: participantId,
      final_report_json: reportData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', finishRequest.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to approve finish request:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function rejectFinish(roomId: string, finishRequestId: string) {
  const { data, error } = await supabaseAdmin
    .from('room_finishes')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', finishRequestId)
    .eq('room_id', roomId)
    .select()
    .single();

  if (error) {
    console.error('Failed to reject finish request:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function getFinishStatus(roomId: string) {
  // Get the most recent finish request for this room
  const { data, error } = await supabaseAdmin
    .from('room_finishes')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Failed to get finish status:', error);
    return null;
  }

  return data;
}

