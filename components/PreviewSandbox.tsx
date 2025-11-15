'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface PreviewSandboxProps {
  roomId: string;
}

export default function PreviewSandbox({ roomId }: PreviewSandboxProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildingMessage, setBuildingMessage] = useState<string | null>(null);

  // Load initial v0 preview URL from room metadata
  useEffect(() => {
    async function loadPreviewUrl() {
      const { data, error } = await supabase
        .from('rooms')
        .select('v0_preview_url')
        .eq('id', roomId)
        .single();

      if (error) {
        console.error('[PreviewSandbox] Error loading preview URL:', error);
        return;
      }

      if (data?.v0_preview_url) {
        setPreviewUrl(data.v0_preview_url);
      }
    }
    loadPreviewUrl();
  }, [roomId]);

  // Subscribe to room updates for preview URL changes
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}:preview`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const newPreviewUrl = payload.new.v0_preview_url as string | null;
          if (newPreviewUrl) {
            setPreviewUrl(newPreviewUrl);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Subscribe to AI status for building overlay
  useEffect(() => {
    const aiChannel = supabase.channel(`room:${roomId}:ai`);
    
    aiChannel
      .on('broadcast', { event: 'ai_status' }, ({ payload }) => {
        const update = payload as {
          phase: string;
          status: string;
          message?: string;
        };
        if (update.phase === 'building') {
          const isNowBuilding =
            update.status === 'started' || update.status === 'progress';
          setIsBuilding(isNowBuilding);
          setBuildingMessage(
            isNowBuilding
              ? update.message || 'Building...'
              : update.message || null
          );
        }
      })
      .subscribe();

    return () => {
      aiChannel.unsubscribe();
    };
  }, [roomId]);

  return (
    <div className="w-full h-full bg-[#171717] rounded-lg border border-gray-800 overflow-hidden relative">
      {!previewUrl ? (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-base font-medium">
              {isBuilding
                ? 'Building your app...'
                : 'Waiting for code...'}
            </p>
            {isBuilding && (
              <p className="text-sm text-gray-400 mt-1">
                {buildingMessage || 'Preparing the sandbox.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title="Vibe de Deux Preview"
            allow="clipboard-read; clipboard-write"
          />
          {isBuilding && (
            <div className="absolute inset-0 bg-[#0c0c0c]/80 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-[#171717] border border-gray-800 rounded-lg px-6 py-4 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-300 font-medium">
                  {buildingMessage || 'Building...'}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
