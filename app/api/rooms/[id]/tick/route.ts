import { NextRequest, NextResponse } from 'next/server';
import { buildSynthesizedPrompt } from '@/lib/promptSynthesizer';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getRoomV0Metadata, upsertRoomV0Metadata } from '@/lib/rooms';
import { v0PlatformClient } from '@/lib/v0PlatformClient';
import type { SynthesizedPrompt } from '@/lib/types';

// In-memory tracking of last tick per room (in production, use Redis or DB)
const lastTickAt = new Map<string, number>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let roomId: string | null = null;
  try {
    const { id } = await params;
    roomId = id;
    const windowMs = 5000; // 5 second window

    // Check if we've ticked recently (prevent spam)
    const now = Date.now();
    const lastTick = lastTickAt.get(roomId) || 0;
    const timeSinceLastTick = now - lastTick;

    if (timeSinceLastTick < 1000) {
      // Don't tick more than once per second
      return NextResponse.json({ message: 'Tick too soon', skipped: true });
    }

    lastTickAt.set(roomId, now);

    // Synthesize prompts from recent commands
    const synthesized = await buildSynthesizedPrompt(roomId, windowMs);

    if (synthesized.topCommands.length === 0) {
      // No commands in the window
      return NextResponse.json({ message: 'No commands to process', skipped: true });
    }

    console.log(`[Tick] Processing ${synthesized.topCommands.length} top commands for room ${roomId}`);

    const aiChannel = supabaseAdmin.channel(`room:${roomId}:ai`);
    const broadcastStatus = async (
      status: 'started' | 'progress' | 'completed' | 'error',
      message: string,
      percent = 0
    ) => {
      await aiChannel.send({
        type: 'broadcast',
        event: 'ai_status',
        payload: {
          phase: 'building',
          status,
          percent,
          message,
        },
      });
    };

    await broadcastStatus(
      'started',
      `Sending ${synthesized.topCommands.length} command(s) to v0`,
      20
    );

    const prompt = buildV0Prompt(roomId, synthesized);

    let projectContext = await getRoomV0Metadata(roomId);
    let currentProjectId = projectContext?.v0_project_id ?? null;
    let currentChatId = projectContext?.v0_chat_id ?? undefined;

    if (!currentProjectId) {
      const created = await v0PlatformClient.createProjectForRoom(roomId);
      currentProjectId = created.projectId;
      currentChatId = created.chatId;
      await upsertRoomV0Metadata(roomId, {
        v0_project_id: currentProjectId,
        v0_chat_id: currentChatId,
      });
    }

    await broadcastStatus('progress', 'v0 is updating the Next.js project', 65);

    const applyResult = await v0PlatformClient.applyPromptToProject(
      currentProjectId,
      prompt,
      {
        chatId: currentChatId,
        context: roomId,
      }
    );

    await upsertRoomV0Metadata(roomId, {
      v0_project_id: applyResult.projectId,
      v0_chat_id: applyResult.chatId,
      v0_version_id: applyResult.versionId ?? null,
      v0_deployment_id: applyResult.deploymentId ?? null,
      v0_preview_url: applyResult.previewUrl ?? null,
    });

    await broadcastStatus(
      'completed',
      'v0 preview refreshed',
      applyResult.previewUrl ? 100 : 90
    );

    // Log the update to patches table for Recent Changes
    await supabaseAdmin.from('patches').insert({
      room_id: roomId,
      patch_json: {
        summary: synthesized.summary,
        commands: synthesized.topCommands,
        commandCount: synthesized.topCommands.length,
      },
    });

    return NextResponse.json({
      message: 'Tick processed successfully',
      synthesized,
      previewUrl: applyResult.previewUrl ?? null,
      v0ProjectId: applyResult.projectId,
    });
  } catch (error) {
    console.error('[Tick] Error processing tick:', error);
    const targetRoomId = roomId ?? 'unknown';
    const aiChannel = supabaseAdmin.channel(`room:${targetRoomId}:ai`);
    await aiChannel.send({
      type: 'broadcast',
      event: 'ai_status',
      payload: {
        phase: 'building',
        status: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    return NextResponse.json(
      {
        error: 'Failed to process tick',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function buildV0Prompt(roomId: string, synthesized: SynthesizedPrompt): string {
  const commandsList = synthesized.topCommands
    .map((cmd, idx) => `${idx + 1}. ${cmd.text} (${cmd.count} votes)`)
    .join('\n');

  return `This is a collaborative Next.js project for room ${roomId}.
Summary: ${synthesized.summary}
Top commands:
${commandsList}

Please improve the existing Next.js app by implementing these requests. Keep every feature additive, preserve prior functionality, and treat the design as a live sandbox preview that should stay responsive. Generate only Next.js app router friendly code (app directory, React 19, TypeScript). Do not rely on DesignSpec palette metadata—colors should come from the prompts themselves.`;
}

