'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { FilePatch } from '@/lib/types';

interface DiffSidebarProps {
  roomId: string;
}

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

  return (
    <div className="bg-[#171717] rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Recent Changes</h2>
      <div className="space-y-2">
        {patches.length === 0 ? (
          <div className="text-sm text-gray-400">No changes yet</div>
        ) : (
          patches.map((patch) => {
            const patchData = patch.patch_json as FilePatch;
            return (
              <div
                key={patch.id}
                className="text-xs bg-[#0c0c0c] p-2 rounded border border-gray-800"
              >
                <div className="text-gray-400 mb-1">
                  {new Date(patch.created_at).toLocaleTimeString()}
                </div>
                <div className="text-gray-300">
                  {patchData.ops.length} file change{patchData.ops.length !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
