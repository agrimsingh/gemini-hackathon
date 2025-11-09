'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type PresenceState = {
  typing: boolean;
  lastActionAt: number;
  name?: string;
  color?: string;
};

export type PresenceById = Record<string, PresenceState>;

export function useRoomPresence(
  roomId: string,
  participantId: string | null,
  displayName: string,
  color: string
) {
  const [presenceById, setPresenceById] = useState<PresenceById>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTrackRef = useRef<PresenceState | null>(null);

  useEffect(() => {
    if (!participantId) return;

    const channel = supabase.channel(`room:${roomId}:presence`, {
      config: {
        presence: {
          key: participantId,
        },
      },
    });

    channelRef.current = channel;

    const initialPresence: PresenceState = {
      typing: false,
      lastActionAt: Date.now(),
      name: displayName,
      color,
    };
    lastTrackRef.current = initialPresence;

    // Subscribe to presence changes
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const mapped: PresenceById = {};

        Object.entries(state).forEach(([key, presences]) => {
          const presence = Array.isArray(presences) ? presences[0] : presences;
          if (presence && typeof presence === 'object') {
            mapped[key] = {
              typing: (presence as any).typing || false,
              lastActionAt: (presence as any).lastActionAt || Date.now(),
              name: (presence as any).name,
              color: (presence as any).color,
            };
          }
        });

        setPresenceById(mapped);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const presence = Array.isArray(newPresences) ? newPresences[0] : newPresences;
        if (presence && typeof presence === 'object') {
          setPresenceById((prev) => ({
            ...prev,
            [key]: {
              typing: (presence as any).typing || false,
              lastActionAt: (presence as any).lastActionAt || Date.now(),
              name: (presence as any).name,
              color: (presence as any).color,
            },
          }));
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceById((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      })
      .subscribe((status) => {
        // Track initial presence after subscription is confirmed
        if (status === 'SUBSCRIBED') {
          channel.track(initialPresence);
        }
      });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, participantId, displayName, color]);

  // Helper to update presence
  const updatePresence = (updates: Partial<PresenceState>) => {
    if (!channelRef.current || !participantId) return;

    const newPresence: PresenceState = {
      ...lastTrackRef.current!,
      ...updates,
      lastActionAt: Date.now(),
    };
    channelRef.current.track(newPresence);
    lastTrackRef.current = newPresence;
  };

  return { presenceById, updatePresence };
}

