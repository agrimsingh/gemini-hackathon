'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Participant } from '@/lib/types';

interface ActivityItem {
  id: string;
  type: 'prompt' | 'analysis' | 'spec' | 'patch' | 'finish';
  participantId?: string;
  participantName?: string;
  participantColor?: string;
  message: string;
  timestamp: string;
}

interface ActivityFeedProps {
  roomId: string;
  participants: Participant[];
}

export default function ActivityFeed({ roomId, participants }: ActivityFeedProps) {
  const [currentBatchActivities, setCurrentBatchActivities] = useState<ActivityItem[]>([]);
  const [previousBatchActivities, setPreviousBatchActivities] = useState<ActivityItem[]>([]);
  const [isPreviousExpanded, setIsPreviousExpanded] = useState(false);
  const [batchNumber, setBatchNumber] = useState(1);

  const getParticipant = (participantId: string) => {
    return participants.find((p) => p.id === participantId);
  };

  useEffect(() => {
    const currentBatch: ActivityItem[] = [];
    const previousBatch: ActivityItem[] = [...previousBatchActivities];

    // Subscribe to prompt_events
    const promptsChannel = supabase
      .channel(`room:${roomId}:activity-prompts`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'prompt_events',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const event = payload.new as any;
          const participant = getParticipant(event.participant_id);
          currentBatch.push({
            id: event.id,
            type: 'prompt',
            participantId: event.participant_id,
            participantName: participant?.display_name || 'Unknown',
            participantColor: participant?.color,
            message: event.text || `[${event.kind}]`,
            timestamp: event.created_at,
          });
          setCurrentBatchActivities([...currentBatch]);
        }
      )
      .subscribe();

    // Subscribe to prompt_analyses - this signals a new batch starting
    const analysesChannel = supabase
      .channel(`room:${roomId}:activity-analyses`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'prompt_analyses',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const analysis = payload.new as any;
          const conflicts = analysis.analysis_json?.conflicts?.length || 0;
          const additive = analysis.analysis_json?.additive?.length || 0;
          
          // Move current batch to previous only if current batch has content
          if (currentBatch.length > 0) {
            setPreviousBatchActivities([...currentBatch]);
            currentBatch.length = 0;
            setBatchNumber((prev) => prev + 1);
          }
          
          currentBatch.push({
            id: analysis.id,
            type: 'analysis',
            message: `AI analyzed prompts${conflicts > 0 ? ` (${conflicts} conflicts)` : ''}${additive > 0 ? ` (${additive} additive)` : ''}`,
            timestamp: analysis.created_at,
          });
          setCurrentBatchActivities([...currentBatch]);
        }
      )
      .subscribe();

    // Subscribe to design_specs
    const specsChannel = supabase
      .channel(`room:${roomId}:activity-specs`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'design_specs',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const spec = payload.new as any;
          currentBatch.push({
            id: spec.id,
            type: 'spec',
            message: 'AI produced design plan',
            timestamp: spec.created_at,
          });
          setCurrentBatchActivities([...currentBatch]);
        }
      )
      .subscribe();

    // Subscribe to patches
    const patchesChannel = supabase
      .channel(`room:${roomId}:activity-patches`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patches',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const patch = payload.new as any;
          const ops = patch.patch_json?.ops || [];
          const fileCount = ops.filter((op: any) => op.op === 'setFile').length;
          currentBatch.push({
            id: patch.id,
            type: 'patch',
            message: `AI wrote code${fileCount > 0 ? ` (+${fileCount} file${fileCount !== 1 ? 's' : ''})` : ''}`,
            timestamp: patch.created_at,
          });
          setCurrentBatchActivities([...currentBatch]);
        }
      )
      .subscribe();

    // Subscribe to room_finishes
    const finishesChannel = supabase
      .channel(`room:${roomId}:activity-finishes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_finishes',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const finish = payload.new as any;
          const participant = getParticipant(finish.requester_id);
          let message = '';
          if (payload.eventType === 'INSERT') {
            message = `${participant?.display_name || 'Someone'} requested to finish`;
          } else if (payload.eventType === 'UPDATE') {
            if (finish.status === 'approved') {
              message = 'Finish request approved';
            } else if (finish.status === 'rejected') {
              message = 'Finish request rejected';
            }
          }
          if (message) {
            currentBatch.push({
              id: finish.id,
              type: 'finish',
              participantId: finish.requester_id,
              participantName: participant?.display_name,
              participantColor: participant?.color,
              message,
              timestamp: finish.updated_at || finish.created_at,
            });
            setCurrentBatchActivities([...currentBatch]);
          }
        }
      )
      .subscribe();

    return () => {
      promptsChannel.unsubscribe();
      analysesChannel.unsubscribe();
      specsChannel.unsubscribe();
      patchesChannel.unsubscribe();
      finishesChannel.unsubscribe();
    };
  }, [roomId, participants]);

  if (currentBatchActivities.length === 0 && previousBatchActivities.length === 0) {
    return null;
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);

    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-4">
      {/* Current Batch Activity */}
      <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">Activity - Batch {batchNumber}</h3>
        </div>
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {currentBatchActivities.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-2">No activity yet</div>
          ) : (
            currentBatchActivities.slice().reverse().map((activity, idx) => (
              <div key={`current-${activity.id}-${idx}`} className="flex items-start gap-2 text-xs">
                {activity.participantColor && (
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: activity.participantColor }}
                  />
                )}
                {!activity.participantColor && activity.type !== 'prompt' && (
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-gray-600" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-gray-300">{activity.message}</div>
                  <div className="text-gray-500 mt-0.5">{formatTime(activity.timestamp)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Previous Batch Activity */}
      {previousBatchActivities.length > 0 && (
        <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden opacity-60">
          <button
            onClick={() => setIsPreviousExpanded(!isPreviousExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1f1f1f] transition-colors border-b border-gray-800"
          >
            <h3 className="text-sm font-semibold text-gray-400">Previous Activity - Batch {batchNumber - 1}</h3>
            <div className="text-gray-500 text-sm">
              {isPreviousExpanded ? '▼' : '▶'}
            </div>
          </button>
          {isPreviousExpanded && (
            <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
              {previousBatchActivities.slice().reverse().map((activity, idx) => (
                <div key={`previous-${activity.id}-${idx}`} className="flex items-start gap-2 text-xs">
                  {activity.participantColor && (
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: activity.participantColor }}
                    />
                  )}
                  {!activity.participantColor && activity.type !== 'prompt' && (
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-gray-600" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-300">{activity.message}</div>
                    <div className="text-gray-500 mt-0.5">{formatTime(activity.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

