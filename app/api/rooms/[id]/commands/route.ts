import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const body = await request.json();
    const { content, participantId } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    // Insert command into database
    const { data, error } = await supabaseAdmin
      .from('room_commands')
      .insert({
        id: uuidv4(),
        room_id: roomId,
        profile_id: participantId || null,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Commands API] Error inserting command:', error);
      return NextResponse.json(
        { error: 'Failed to create command' },
        { status: 500 }
      );
    }

    // Supabase realtime will automatically broadcast the change
    // via postgres_changes subscription
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Commands API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

