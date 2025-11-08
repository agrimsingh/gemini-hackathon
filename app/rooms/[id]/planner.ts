'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { callGeminiPlanner } from '@/lib/gemini';
import { createHash } from 'crypto';
import type { DesignSpec } from '@/lib/types';

const plannerLocks = new Map<string, Promise<any>>();

export async function runPlanner(roomId: string, chaos: number = 0) {
  // Single-flight lock per room
  if (plannerLocks.has(roomId)) {
    return plannerLocks.get(roomId);
  }

  const promise = (async () => {
    try {
      // Get recent events (last 10 seconds for real-time batching)
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      const { data: events } = await supabaseAdmin
        .from('prompt_events')
        .select('*')
        .eq('room_id', roomId)
        .gte('created_at', tenSecondsAgo)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!events || events.length === 0) {
        return null;
      }

      // Get the latest design spec to build upon (for cumulative evolution)
      const { data: latestSpec } = await supabaseAdmin
        .from('design_specs')
        .select('spec_json')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Call Gemini planner with context
      const prompt = events.map((e) => e.text || `[${e.kind}]`).join('\n');
      const spec = await callGeminiPlanner(prompt, events, latestSpec?.spec_json);

      // Generate hash
      const specHash = createHash('sha256')
        .update(JSON.stringify(spec))
        .digest('hex');

      // Check if spec already exists
      const { data: existing } = await supabaseAdmin
        .from('design_specs')
        .select('id')
        .eq('spec_hash', specHash)
        .single();

      if (existing) {
        return existing.id;
      }

      // Store new spec
      const { data: newSpec, error } = await supabaseAdmin
        .from('design_specs')
        .insert({
          room_id: roomId,
          spec_json: spec,
          spec_hash: specHash,
        })
        .select()
        .single();

      if (error) throw error;

      return newSpec.id;
    } finally {
      plannerLocks.delete(roomId);
    }
  })();

  plannerLocks.set(roomId, promise);
  return promise;
}

