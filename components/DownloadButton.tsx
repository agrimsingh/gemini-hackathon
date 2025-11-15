'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface DownloadButtonProps {
  roomId: string;
}

export default function DownloadButton({ roomId }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasVersion, setHasVersion] = useState(false);

  useEffect(() => {
    async function checkVersion() {
      const { data } = await supabase
        .from('rooms')
        .select('v0_version_id')
        .eq('id', roomId)
        .single();

      setHasVersion(!!data?.v0_version_id);
    }
    checkVersion();

    // Subscribe to room updates
    const channel = supabase
      .channel(`room:${roomId}:download`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const versionId = payload.new.v0_version_id;
          setHasVersion(!!versionId);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/rooms/${roomId}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibe-room-${roomId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download version files');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!hasVersion) {
    return null;
  }

  return (
    <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">Download</h3>
      </div>
      <div className="p-4">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full text-xs px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-medium"
        >
          {isDownloading ? 'Downloading...' : '📦 Download Version Files'}
        </button>
      </div>
    </div>
  );
}

