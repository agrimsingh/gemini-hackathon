'use client';

import { useEffect, useRef } from 'react';
import { runPlanner } from '@/app/rooms/[id]/planner';
import { runBuilder } from '@/app/rooms/[id]/builder';
import { supabase } from '@/lib/supabase/client';

interface PlannerHookProps {
  roomId: string;
  chaos: number;
  isJudgeMode: boolean;
}

export function usePlannerBuilder({ roomId, chaos, isJudgeMode }: PlannerHookProps) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpecIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isJudgeMode) return;

    const channel = supabase
      .channel(`room:${roomId}:planner-trigger`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'prompt_events',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Debounce planner calls (2 seconds)
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }

          debounceRef.current = setTimeout(async () => {
            try {
              const specId = await runPlanner(roomId, chaos);
              if (specId && specId !== lastSpecIdRef.current) {
                lastSpecIdRef.current = specId;
                await runBuilder(roomId, specId);
              }
            } catch (error) {
              console.error('Planner/Builder error:', error);
            }
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [roomId, chaos, isJudgeMode]);
}

