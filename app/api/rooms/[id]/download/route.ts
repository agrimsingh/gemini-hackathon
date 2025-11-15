import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { v0PlatformClient } from '@/lib/v0PlatformClient';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  try {
    // Get the room's v0 context
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('v0_project_id, v0_chat_id, v0_version_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (!room.v0_chat_id || !room.v0_version_id) {
      return NextResponse.json(
        { error: 'No version available to download' },
        { status: 400 }
      );
    }

    // Download the version files
    const zipBuffer = await v0PlatformClient.downloadVersionFiles(
      room.v0_chat_id,
      room.v0_version_id
    );

    // Return as downloadable zip
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="vibe-room-${roomId}.zip"`,
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { error: 'Failed to download version files' },
      { status: 500 }
    );
  }
}

