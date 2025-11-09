"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { callGeminiConflictAnalyzer } from "@/lib/gemini";
import type { PromptEvent } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { analyzerLocks } from "@/lib/analyzerLocks";

export async function runConflictAnalyzer(roomId: string) {
  // Single-flight lock per room
  if (analyzerLocks.has(roomId)) {
    return analyzerLocks.get(roomId);
  }

  const promise = (async () => {
    try {
      // Get the timestamp of the most recent analysis to avoid re-analyzing events
      const { data: lastAnalysis } = await supabaseAdmin
        .from("prompt_analyses")
        .select("created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Query events after the last analysis, or last 15s if no prior analysis
      const cutoffTime = lastAnalysis?.created_at
        ? lastAnalysis.created_at
        : new Date(Date.now() - 15000).toISOString();

      const { data: events } = await supabaseAdmin
        .from("prompt_events")
        .select("*")
        .eq("room_id", roomId)
        .gt("created_at", cutoffTime)
        .order("created_at", { ascending: true }) // Oldest first = chronological order
        .limit(50);

      console.log(
        `[Analyzer] Fetched ${
          events?.length || 0
        } events after ${cutoffTime} (last analysis cutoff)`
      );
      if (events && events.length > 0) {
        console.log(
          "[Analyzer] Event IDs (chronological):",
          events.map((e) => ({
            id: e.id.slice(0, 8),
            text: e.text?.slice(0, 30),
            created_at: e.created_at,
          }))
        );
      }

      if (!events || events.length === 0) {
        return null;
      }

      // Get the latest design spec for context
      const { data: latestSpec } = await supabaseAdmin
        .from("design_specs")
        .select("spec_json")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Stream the conflict analysis
      const generator = callGeminiConflictAnalyzer(
        events as PromptEvent[],
        latestSpec?.spec_json
      );

      let thinkingTrace = "";
      let analysis = null;

      for await (const chunk of generator) {
        if (chunk.type === "thinking") {
          thinkingTrace += chunk.text;
        } else if (chunk.type === "complete") {
          analysis = chunk.analysis;
          thinkingTrace = chunk.thinkingTrace;
        }
      }

      if (!analysis) {
        throw new Error("No analysis result from conflict analyzer");
      }

      // Store the analysis in the database
      const analysisId = uuidv4();
      const { data: newAnalysis, error } = await supabaseAdmin
        .from("prompt_analyses")
        .insert({
          id: analysisId,
          room_id: roomId,
          prompt_event_ids: events.map((e) => e.id),
          analysis_json: analysis,
          thinking_trace: thinkingTrace,
        })
        .select()
        .single();

      if (error) throw error;

      return analysisId;
    } finally {
      analyzerLocks.delete(roomId);
    }
  })();

  analyzerLocks.set(roomId, promise);
  return promise;
}
