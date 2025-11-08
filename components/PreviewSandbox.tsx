'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { applyFsDiff } from '@/lib/fsDiff';
import type { FilePatch } from '@/lib/types';

interface PreviewSandboxProps {
  roomId: string;
}

export default function PreviewSandbox({ roomId }: PreviewSandboxProps) {
  const [files, setFiles] = useState<Map<string, string>>(new Map());
  const [htmlContent, setHtmlContent] = useState<string>('');

  // Load initial files from database
  useEffect(() => {
    async function loadFiles() {
      const { data, error } = await supabase
        .from('files')
        .select('path, content')
        .eq('room_id', roomId);

      if (error) {
        console.error('[PreviewSandbox] Error loading files:', error);
        return;
      }

      if (data && data.length > 0) {
        const fileMap = new Map<string, string>();
        data.forEach((f) => fileMap.set(f.path, f.content));
        setFiles(fileMap);
        updatePreview(fileMap);
      }
    }
    loadFiles();
  }, [roomId]);

  // Subscribe to real-time patches
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}:patches`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patches',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const patch = payload.new.patch_json as FilePatch;
          setFiles((prev) => {
            const updated = applyFsDiff(prev, patch);
            updatePreview(updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  function updatePreview(fileMap: Map<string, string>) {
    // Get the index.html or create a combined view
    let html = fileMap.get('index.html') || '';
    
    if (!html) {
      // Fallback: show waiting message
      html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dream Sandbox</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0c0c0c;
      color: #fff;
    }
  </style>
</head>
<body>
  <div>
    <h1>Dream Sandbox</h1>
    <p>Waiting for code generation...</p>
  </div>
</body>
</html>`;
    }

    setHtmlContent(html);
  }

  return (
    <div className="w-full h-full bg-[#171717] rounded-lg border border-gray-800 overflow-hidden">
      {files.size === 0 ? (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          Waiting for code...
        </div>
      ) : (
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          sandbox="allow-scripts"
          title="Preview"
        />
      )}
    </div>
  );
}
