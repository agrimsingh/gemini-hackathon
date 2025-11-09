'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export default function HomePage() {
  const [roomId, setRoomId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const createRoom = async () => {
    if (!displayName.trim()) return;
    setIsCreating(true);
    try {
      const newRoomId = uuidv4();
      const { data: room } = await supabase
        .from('rooms')
        .insert({ id: newRoomId })
        .select()
        .single();

      if (room) {
        router.push(`/rooms/${newRoomId}?name=${encodeURIComponent(displayName)}`);
      }
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    if (!roomId.trim() || !displayName.trim()) return;
    router.push(`/rooms/${roomId}?name=${encodeURIComponent(displayName)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-4xl font-bold text-center">Vibe de Deux</h1>
        <p className="text-gray-400 text-center">
          Realtime collaborative AI code generation
        </p>
        
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2 bg-[#171717] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
            onKeyDown={(e) => e.key === 'Enter' && (roomId ? joinRoom() : createRoom())}
          />
          
          <div className="space-y-2">
            <button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#0c0c0c] text-gray-500">or</span>
              </div>
            </div>
            
            <input
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-2 bg-[#171717] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            />
            
            <button
              onClick={joinRoom}
              className="w-full px-4 py-2 bg-[#171717] border border-gray-800 rounded-lg text-white hover:bg-[#1f1f1f]"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

