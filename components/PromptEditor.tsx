'use client';

import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { createPromptEvent } from '@/app/rooms/[id]/events';

interface PromptEditorProps {
  roomId: string;
  participantId: string;
}

export default function PromptEditor({ roomId, participantId }: PromptEditorProps) {
  const [text, setText] = useState('');
  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('prompt');
    ydocRef.current = ydoc;
    ytextRef.current = ytext;

    // Persist to IndexedDB
    const persistence = new IndexeddbPersistence(`room-${roomId}`, ydoc);

    // Sync text changes
    ytext.observe((event) => {
      setText(ytext.toString());
    });

    // Initial load
    setText(ytext.toString());

    return () => {
      persistence.destroy();
      ydoc.destroy();
    };
  }, [roomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      await createPromptEvent(roomId, participantId, 'text', text);
      // Clear Yjs text after sending
      if (ytextRef.current) {
        ytextRef.current.delete(0, ytextRef.current.length);
      }
      setText('');
    } catch (error) {
      console.error('Failed to send prompt:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    
    // Update Yjs text
    if (ytextRef.current) {
      const current = ytextRef.current.toString();
      if (current !== newText) {
        ytextRef.current.delete(0, current.length);
        ytextRef.current.insert(0, newText);
      }
    }
  };

  return (
    <div className="bg-[#171717] rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold">Your Prompt</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={text}
          onChange={handleChange}
          placeholder="Type your idea..."
          className="w-full h-32 px-3 py-2 bg-[#0c0c0c] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200"
          >
            Send
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-[#171717] border border-gray-800 rounded-lg hover:bg-[#1f1f1f]"
            title="Voice input (coming soon)"
          >
            🎤
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-[#171717] border border-gray-800 rounded-lg hover:bg-[#1f1f1f]"
            title="Image upload (coming soon)"
          >
            🖼️
          </button>
        </div>
      </form>
    </div>
  );
}
