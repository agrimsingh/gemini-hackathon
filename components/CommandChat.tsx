'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RoomCommand, Participant } from '@/lib/types';

interface CommandChatProps {
  roomId: string;
  participantId: string;
  displayName: string;
  color: string;
  participants: Participant[];
}

export default function CommandChat({
  roomId,
  participantId,
  displayName,
  color,
  participants,
}: CommandChatProps) {
  const [commands, setCommands] = useState<RoomCommand[]>([]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commandsEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to room_commands changes
  useEffect(() => {
    // Initial load
    const loadCommands = async () => {
      const { data } = await supabase
        .from('room_commands')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setCommands(data.reverse()); // Reverse to show oldest first
      }
    };

    loadCommands();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`room:${roomId}:commands`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_commands',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newCommand = payload.new as RoomCommand;
          setCommands((prev) => [...prev, newCommand]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Auto-scroll to bottom when new commands arrive
  useEffect(() => {
    commandsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commands]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/rooms/${roomId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input,
          participantId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send command');
      }

      setInput('');
    } catch (error) {
      console.error('Failed to send command:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getParticipantName = (profileId: string | null) => {
    if (!profileId) return 'Anon';
    const participant = participants.find((p) => p.id === profileId);
    return participant?.display_name || 'Anon';
  };

  const getParticipantColor = (profileId: string | null) => {
    if (!profileId) return '#666';
    const participant = participants.find((p) => p.id === profileId);
    return participant?.color || '#666';
  };

  // Count command frequencies for highlighting
  const commandCounts = commands.reduce((acc, cmd) => {
    const normalized = cmd.content.toLowerCase().trim();
    acc[normalized] = (acc[normalized] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-[#171717] rounded-lg p-4 space-y-4 flex flex-col h-[600px]">
      <h2 className="text-lg font-semibold">Command Chat</h2>
      
      {/* Commands list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {commands.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">
            No commands yet. Start typing!
          </div>
        ) : (
          commands.map((cmd) => {
            const normalized = cmd.content.toLowerCase().trim();
            const count = commandCounts[normalized] || 1;
            const isOwn = cmd.profile_id === participantId;
            
            return (
              <div
                key={cmd.id}
                className={`text-sm p-2 rounded ${
                  isOwn ? 'bg-[#0c0c0c]' : 'bg-[#1f1f1f]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="font-medium"
                    style={{ color: getParticipantColor(cmd.profile_id) }}
                  >
                    {getParticipantName(cmd.profile_id)}:
                  </span>
                  <span className="flex-1">{cmd.content}</span>
                  {count > 1 && (
                    <span className="text-xs text-gray-500 bg-[#0c0c0c] px-2 py-0.5 rounded">
                      ×{count}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(cmd.created_at).toLocaleTimeString()}
                </div>
              </div>
            );
          })
        )}
        <div ref={commandsEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command..."
          className="w-full px-3 py-2 bg-[#0c0c0c] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={!input.trim() || isSubmitting}
          className="w-full px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Sending...' : 'Send Command'}
        </button>
      </form>
    </div>
  );
}

