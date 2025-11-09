"use client";

import { useEffect, useRef } from "react";
import { runPlanner } from "@/app/rooms/[id]/planner";
import { runBuilder } from "@/app/rooms/[id]/builder";
import { supabase } from "@/lib/supabase/client";

interface PlannerHookProps {
  roomId: string;
}

export function usePlannerBuilder({ roomId }: PlannerHookProps) {
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const batchInProgressRef = useRef<boolean>(false);
  const lastSpecIdRef = useRef<string | null>(null);
  const eventCountRef = useRef<number>(0);

  useEffect(() => {
    const processBatch = async () => {
      console.log("[Batching] Processing batch");
      const aiChannel = supabase.channel(`room:${roomId}:ai`);
      
      try {
        // Broadcast planning started
        await aiChannel.send({
          type: 'broadcast',
          event: 'ai_status',
          payload: {
            phase: 'planning',
            status: 'started',
            percent: 60,
          },
        });

        const specId = await runPlanner(roomId);
        
        // Broadcast planning completed
        await aiChannel.send({
          type: 'broadcast',
          event: 'ai_status',
          payload: {
            phase: 'planning',
            status: 'completed',
            percent: 85,
          },
        });

        if (specId && specId !== lastSpecIdRef.current) {
          lastSpecIdRef.current = specId;
          
          // Broadcast building started
          await aiChannel.send({
            type: 'broadcast',
            event: 'ai_status',
            payload: {
              phase: 'building',
              status: 'started',
              percent: 85,
            },
          });

          await runBuilder(roomId, specId);
          
          // Building completion will be confirmed by patches insert in AIStatusTimeline
        }
      } catch (error) {
        console.error("Planner/Builder error:", error);
        
        // Broadcast error
        await aiChannel.send({
          type: 'broadcast',
          event: 'ai_status',
          payload: {
            phase: 'planning',
            status: 'error',
            percent: 0,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } finally {
        // Reset batch state
        batchInProgressRef.current = false;
        batchTimerRef.current = null;
        eventCountRef.current = 0;
        console.log("[Batching] Batch complete - ready for next batch");
      }
    };

    const channel = supabase
      .channel(`room:${roomId}:planner-trigger`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prompt_events",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // If a batch is already in progress, just let it collect this event
          if (batchInProgressRef.current) {
            eventCountRef.current++;
            console.log(
              `[Batching] Event ${eventCountRef.current} received during active batch`
            );

            // If this is the second event, trigger immediately
            if (eventCountRef.current === 2) {
              console.log(
                "[Batching] Second event received - triggering batch early"
              );
              if (batchTimerRef.current) {
                clearTimeout(batchTimerRef.current);
              }
              processBatch();
            }
            return;
          }

          // Start a new batch window
          console.log(
            "[Batching] Starting new batch window (max 10s or on second event)"
          );
          batchInProgressRef.current = true;
          eventCountRef.current = 1;

          batchTimerRef.current = setTimeout(async () => {
            console.log(
              "[Batching] 10-second timeout reached - processing events"
            );
            await processBatch();
          }, 10000); // Max 10-second window
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [roomId]);
}
