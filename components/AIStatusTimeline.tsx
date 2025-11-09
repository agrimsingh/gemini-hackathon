'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type AIPhase = 'analyzing' | 'planning' | 'building';
type AIStatus = 'idle' | 'started' | 'progress' | 'completed' | 'error';

interface AIPhaseState {
  phase: AIPhase;
  status: AIStatus;
  percent: number;
  message?: string;
  meta?: any;
}

interface AIStatusTimelineProps {
  roomId: string;
}

export default function AIStatusTimeline({ roomId }: AIStatusTimelineProps) {
  const [phases, setPhases] = useState<Record<AIPhase, AIPhaseState>>({
    analyzing: { phase: 'analyzing', status: 'idle', percent: 0 },
    planning: { phase: 'planning', status: 'idle', percent: 0 },
    building: { phase: 'building', status: 'idle', percent: 0 },
  });

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}:ai`);

    channel
      .on('broadcast', { event: 'ai_status' }, ({ payload }) => {
        const update = payload as Partial<AIPhaseState> & { phase: AIPhase };
        setPhases((prev) => {
          const current = prev[update.phase];
          const newState: AIPhaseState = {
            ...current,
            ...update,
            percent: update.percent ?? current.percent,
          };

          // Auto-progress heuristics
          if (update.status === 'started') {
            // Reset all phases to idle when a new batch starts (analyzing starts)
            if (update.phase === 'analyzing') {
              return {
                analyzing: { phase: 'analyzing', status: 'started', percent: 0 },
                planning: { phase: 'planning', status: 'idle', percent: 0 },
                building: { phase: 'building', status: 'idle', percent: 0 },
              };
            } else if (update.phase === 'planning') {
              newState.percent = 60;
            } else if (update.phase === 'building') {
              newState.percent = 85;
            }
          } else if (update.status === 'progress' && update.percent !== undefined) {
            newState.percent = update.percent;
          } else if (update.status === 'completed') {
            newState.percent = 100;
          }

          return {
            ...prev,
            [update.phase]: newState,
          };
        });
      })
      .subscribe();

    // Also listen for patches to confirm building is done
    const patchesChannel = supabase
      .channel(`room:${roomId}:patches-confirm`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patches',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          setPhases((prev) => ({
            ...prev,
            building: { ...prev.building, status: 'completed', percent: 100 },
          }));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      patchesChannel.unsubscribe();
    };
  }, [roomId]);

  const getPhaseLabel = (phase: AIPhase): string => {
    switch (phase) {
      case 'analyzing':
        return 'Analyzing';
      case 'planning':
        return 'Planning';
      case 'building':
        return 'Building';
    }
  };

  const getNextPhase = (currentPhase: AIPhase): AIPhase | null => {
    switch (currentPhase) {
      case 'analyzing':
        return 'planning';
      case 'planning':
        return 'building';
      case 'building':
        return null;
    }
  };

  const getStatusColor = (status: AIStatus): string => {
    switch (status) {
      case 'idle':
        return 'bg-gray-800';
      case 'started':
      case 'progress':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
    }
  };

  const phaseOrder: AIPhase[] = ['analyzing', 'planning', 'building'];

  const hasActivePhase = phaseOrder.some((phase) => phases[phase].status !== 'idle');

  if (!hasActivePhase) {
    return null;
  }

  return (
    <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">AI Status</h3>
      </div>
      <div className="p-4 space-y-3">
        {phaseOrder.map((phase, idx) => {
          const state = phases[phase];
          const isActive = state.status !== 'idle';
          const nextPhase = getNextPhase(phase);
          const showNext = isActive && nextPhase && phases[nextPhase].status === 'idle';

          if (!isActive && idx > 0 && phases[phaseOrder[idx - 1]].status === 'idle') {
            return null;
          }

          return (
            <div key={phase} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${getStatusColor(state.status)} ${
                      state.status === 'progress' || state.status === 'started' ? 'animate-pulse' : ''
                    }`}
                  />
                  <span className="text-gray-400">
                    {getPhaseLabel(phase)} {idx === 0 && state.status === 'started' && '(1/3)'}
                    {idx === 1 && state.status === 'started' && '(2/3)'}
                    {idx === 2 && state.status === 'started' && '(3/3)'}
                  </span>
                </div>
                {state.status === 'completed' && (
                  <span className="text-green-400 text-xs">✓</span>
                )}
                {showNext && (
                  <span className="text-gray-500 text-xs">Next: {getPhaseLabel(nextPhase!)}</span>
                )}
              </div>
              {(state.status === 'started' || state.status === 'progress') && (
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${state.percent}%` }}
                  />
                </div>
              )}
              {state.message && (
                <div className="text-xs text-gray-500 mt-1">{state.message}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

