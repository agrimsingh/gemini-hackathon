'use client';

import { motion } from 'framer-motion';
import type { Participant } from '@/lib/types';
import type { PresenceById } from '@/lib/useRoomPresence';

interface PresenceRingsProps {
  participants: Participant[];
  currentId: string;
  presenceById?: PresenceById;
}

export default function PresenceRings({ participants, currentId, presenceById }: PresenceRingsProps) {
  const getIdleTime = (lastActionAt: number) => {
    return Date.now() - lastActionAt;
  };

  const isIdle = (participantId: string) => {
    if (!presenceById || !presenceById[participantId]) return false;
    return getIdleTime(presenceById[participantId].lastActionAt) > 30000; // 30s
  };

  const isTyping = (participantId: string) => {
    return presenceById?.[participantId]?.typing || false;
  };

  return (
    <div className="flex items-center gap-2">
      {participants.map((p) => {
        const isCurrent = p.id === currentId;
        const pulseScale = 1 + p.weight * 0.3;
        const typing = isTyping(p.id);
        const idle = isIdle(p.id);
        const presence = presenceById?.[p.id];

        return (
          <motion.div
            key={p.id}
            className="relative"
            animate={{
              scale: typing ? [1, pulseScale * 1.1, 1] : [1, pulseScale, 1],
            }}
            transition={{
              duration: typing ? 0.8 : 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            title={typing ? `${p.display_name} is typing...` : presence ? `${p.display_name}` : undefined}
          >
            <div
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-opacity ${
                idle ? 'opacity-50' : ''
              }`}
              style={{
                borderColor: p.color,
                backgroundColor: isCurrent ? `${p.color}20` : 'transparent',
              }}
            >
              {p.display_name[0].toUpperCase()}
            </div>
            {typing && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-75"
                style={{ borderColor: p.color }}
              />
            )}
            {isCurrent && !typing && (
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

