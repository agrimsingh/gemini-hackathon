'use client';

import { motion } from 'framer-motion';
import type { Participant } from '@/lib/types';

interface PresenceRingsProps {
  participants: Participant[];
  currentId: string;
}

export default function PresenceRings({ participants, currentId }: PresenceRingsProps) {
  return (
    <div className="flex items-center gap-2">
      {participants.map((p) => {
        const isCurrent = p.id === currentId;
        const pulseScale = 1 + p.weight * 0.3;

        return (
          <motion.div
            key={p.id}
            className="relative"
            animate={{
              scale: [1, pulseScale, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <div
              className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-medium"
              style={{
                borderColor: p.color,
                backgroundColor: isCurrent ? `${p.color}20` : 'transparent',
              }}
            >
              {p.display_name[0].toUpperCase()}
            </div>
            {isCurrent && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-75"
                style={{ borderColor: p.color }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

