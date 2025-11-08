'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { joinRoom } from './join';
import { usePlannerBuilder } from '@/lib/plannerHook';
import type { Participant } from '@/lib/types';
import PresenceRings from '@/components/PresenceRings';
import PromptEditor from '@/components/PromptEditor';
import PreviewSandbox from '@/components/PreviewSandbox';
import HeatmapOverlay from '@/components/HeatmapOverlay';
import Controls from '@/components/Controls';
import DiffSidebar from '@/components/DiffSidebar';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const displayName = searchParams.get('name') || 'Anonymous';
  
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isJoining, setIsJoining] = useState(true);
  const [chaos, setChaos] = useState(0);
  const [isJudgeMode, setIsJudgeMode] = useState(false);
  const joiningRef = useRef(false);

  usePlannerBuilder({ roomId, chaos, isJudgeMode });

  useEffect(() => {
    let mounted = true;

    // Prevent multiple simultaneous joins
    if (joiningRef.current) return;
    joiningRef.current = true;

    async function init() {
      try {
        // Check if we already have a participant ID for this room
        const storageKey = `participant_${roomId}`;
        const storedParticipantId = typeof window !== 'undefined' 
          ? localStorage.getItem(storageKey) 
          : null;

        let pid: string;
        let color: string;

        if (storedParticipantId) {
          // Verify participant still exists
          const { data: existing } = await supabase
            .from('participants')
            .select('id, color')
            .eq('id', storedParticipantId)
            .eq('room_id', roomId)
            .single();

          if (existing) {
            pid = existing.id;
            color = existing.color;
          } else {
            // Participant doesn't exist, create/reuse one
            const result = await joinRoom(roomId, displayName);
            pid = result.participantId;
            color = result.color;
            if (typeof window !== 'undefined') {
              localStorage.setItem(storageKey, pid);
            }
          }
        } else {
          // No stored participant, create/reuse one
          const result = await joinRoom(roomId, displayName);
          pid = result.participantId;
          color = result.color;
          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, pid);
          }
        }

        if (!mounted) {
          joiningRef.current = false;
          return;
        }
        setParticipantId(pid);

        // Subscribe to participants changes
        const participantsChannel = supabase
          .channel(`room:${roomId}:participants`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'participants',
              filter: `room_id=eq.${roomId}`,
            },
            async () => {
              const { data } = await supabase
                .from('participants')
                .select('*')
                .eq('room_id', roomId);
              if (data && mounted) {
                // Deduplicate by participant ID
                const uniqueParticipants = Array.from(
                  new Map(data.map((p) => [p.id, p])).values()
                ) as Participant[];
                setParticipants(uniqueParticipants);
              }
            }
          )
          .subscribe();

        // Initial load
        const { data } = await supabase
          .from('participants')
          .select('*')
          .eq('room_id', roomId);
        if (data && mounted) {
          // Deduplicate by participant ID
          const uniqueParticipants = Array.from(
            new Map(data.map((p) => [p.id, p])).values()
          ) as Participant[];
          setParticipants(uniqueParticipants);
        }

        setIsJoining(false);
        joiningRef.current = false;

        return () => {
          participantsChannel.unsubscribe();
        };
      } catch (error) {
        console.error('Failed to join room:', error);
        joiningRef.current = false;
      }
    }

    init();

    return () => {
      mounted = false;
      joiningRef.current = false;
    };
  }, [roomId]); // Only depend on roomId, not displayName

  if (isJoining || !participantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Joining room...</div>
      </div>
    );
  }

  const currentParticipant = participants.find((p) => p.id === participantId);

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white flex flex-col">
      <header className="border-b border-gray-800 p-4 flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dream Sandbox</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-400">Room ID:</span>
            <code className="text-xs bg-[#171717] px-2 py-1 rounded border border-gray-800 font-mono">
              {roomId}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(roomId);
              }}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-[#171717]"
              title="Copy room ID"
            >
              📋
            </button>
          </div>
        </div>
        <PresenceRings participants={participants} currentId={participantId} />
      </header>

      <div className="flex-1 grid grid-cols-[400px_1fr_300px] gap-4 p-4">
        <div className="space-y-4">
          <PromptEditor roomId={roomId} participantId={participantId} />
          <DiffSidebar roomId={roomId} />
        </div>

        <div className="relative">
          <PreviewSandbox roomId={roomId} />
          <HeatmapOverlay participants={participants} roomId={roomId} />
        </div>

        <div>
          <Controls roomId={roomId} chaos={chaos} setChaos={setChaos} isJudgeMode={isJudgeMode} setIsJudgeMode={setIsJudgeMode} />
        </div>
      </div>
    </div>
  );
}

