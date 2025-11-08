'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';
import type { Participant, DesignSpec } from '@/lib/types';

interface HeatmapOverlayProps {
  participants: Participant[];
  roomId: string;
}

export default function HeatmapOverlay({ participants, roomId }: HeatmapOverlayProps) {
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [spec, setSpec] = useState<DesignSpec | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}:specs`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'design_specs',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const specData = payload.new.spec_json as DesignSpec;
          setSpec(specData);
          
          // Compute weights from tensions
          const weightMap: Record<string, number> = {};
          specData.tensions.forEach((t) => {
            weightMap[t.participantId] = t.weight;
          });
          setWeights(weightMap);
        }
      )
      .subscribe();

    // Load latest spec
    supabase
      .from('design_specs')
      .select('spec_json')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          const specData = data.spec_json as DesignSpec;
          setSpec(specData);
          const weightMap: Record<string, number> = {};
          specData.tensions.forEach((t) => {
            weightMap[t.participantId] = t.weight;
          });
          setWeights(weightMap);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Apply theme vars if available - must be called unconditionally
  useEffect(() => {
    if (spec?.themeVars) {
      const root = document.documentElement;
      Object.entries(spec.themeVars).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
    }
  }, [spec]);

  // Early return after all hooks
  if (!spec || Object.keys(weights).length === 0) {
    return null;
  }

  const maxWeight = Math.max(...Object.values(weights), 0);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {participants.map((p) => {
        const weight = weights[p.id] || 0;
        const opacity = maxWeight > 0 ? weight / maxWeight : 0;

        return (
          <motion.div
            key={p.id}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at center, ${p.color}20 0%, transparent 70%)`,
              opacity: opacity * 0.3,
            }}
            animate={{ opacity: opacity * 0.3 }}
            transition={{ duration: 0.5 }}
          />
        );
      })}
    </div>
  );
}
