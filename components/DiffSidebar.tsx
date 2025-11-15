'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { FilePatch } from '@/lib/types';

interface DiffSidebarProps {
  roomId: string;
}

const MAX_DISPLAY_FILES = 3;

export default function DiffSidebar({ roomId }: DiffSidebarProps) {
  const [patches, setPatches] = useState<any[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}:patches-sidebar`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patches',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data } = await supabase
            .from('patches')
            .select('*')
            .eq('room_id', roomId)
            .order('created_at', { ascending: false })
            .limit(10);
          if (data) {
            setPatches(data);
          }
        }
      )
      .subscribe();

    // Initial load
    supabase
      .from('patches')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setPatches(data);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const formatTime = (timestamp: string | null | undefined) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  };

  const deriveUpdateSummary = (patch: any) => {
    const patchData =
      typeof patch.patch_json === 'object' && patch.patch_json !== null
        ? patch.patch_json
        : null;

    if (!patchData) {
      return { summary: 'Unknown update', commands: [], commandCount: 0 };
    }

    return {
      summary: patchData.summary || 'Update',
      commands: Array.isArray(patchData.commands) ? patchData.commands : [],
      commandCount: patchData.commandCount || 0,
    };
  };

  return (
    <div className="bg-[#171717] rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Recent Changes</h2>
      <div className="space-y-2">
        {patches.length === 0 ? (
          <div className="text-sm text-gray-400">No changes yet</div>
        ) : (
          patches.map((patch) => {
            const { summary, commands, commandCount } = deriveUpdateSummary(patch);

            return (
              <div
                key={patch.id}
                className="text-xs bg-[#0c0c0c] p-2 rounded border border-gray-800"
              >
                <div className="flex items-center justify-between text-gray-400 mb-1">
                  <span>{formatTime(patch.created_at)}</span>
                  <span className="font-semibold text-gray-200">
                    {commandCount} command{commandCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-[10px] text-gray-300 mb-1 italic">
                  {summary}
                </div>
                {commands.length > 0 && (
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    {commands.slice(0, MAX_DISPLAY_FILES).map((cmd: any, idx: number) => (
                      <div key={idx} className="truncate">
                        • {cmd.text} ({cmd.count} vote{cmd.count !== 1 ? 's' : ''})
                      </div>
                    ))}
                    {commands.length > MAX_DISPLAY_FILES && (
                      <div className="text-gray-500">
                        +{commands.length - MAX_DISPLAY_FILES} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
