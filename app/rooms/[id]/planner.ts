"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { callGeminiPlanner } from "@/lib/gemini";
import { createHash } from "crypto";
import type { DesignSpec } from "@/lib/types";
import { runConflictAnalyzer } from "./analyzer";

const plannerLocks = new Map<string, Promise<any>>();

export async function runPlanner(roomId: string) {
  // Single-flight lock per room
  if (plannerLocks.has(roomId)) {
    return plannerLocks.get(roomId);
  }

  const promise = (async () => {
    try {
      console.log(`[Planner] Starting planner run for room ${roomId}`);

      // First, run conflict analyzer to understand prompt relationships
      const analysisId = await runConflictAnalyzer(roomId);

      if (!analysisId) {
        // No recent events to analyze
        console.log("[Planner] No analysis ID returned - no recent events");
        return null;
      }

      console.log(`[Planner] Received analysis ID: ${analysisId}`);

      // Fetch the conflict analysis result
      const { data: analysisData } = await supabaseAdmin
        .from("prompt_analyses")
        .select("analysis_json, prompt_event_ids")
        .eq("id", analysisId)
        .single();

      if (!analysisData) {
        throw new Error("Failed to fetch conflict analysis");
      }

      const analysis = analysisData.analysis_json;
      const analyzedEventIds = analysisData.prompt_event_ids;

      console.log(
        `[Planner] Analysis covered ${analyzedEventIds.length} events`
      );
      console.log(
        `[Planner] Prioritized order:`,
        analysis.prioritizedPrompts.map((id: string) => id.slice(0, 8))
      );

      // Fetch the exact events that were analyzed (by ID)
      // This ensures we work with the same events the analyzer saw, even if time has passed
      const { data: events } = await supabaseAdmin
        .from("prompt_events")
        .select("*")
        .eq("room_id", roomId)
        .in("id", analyzedEventIds)
        .order("created_at", { ascending: true });

      console.log(
        `[Planner] Fetched ${events?.length || 0} events that were analyzed`
      );
      if (events && events.length > 0) {
        console.log(
          "[Planner] Event IDs (chronological):",
          events.map((e) => ({
            id: e.id.slice(0, 8),
            text: e.text?.slice(0, 30),
            created_at: e.created_at,
          }))
        );
      }

      if (!events || events.length === 0) {
        console.log("[Planner] No events found for analysis IDs");
        return null;
      }

      // Filter and reorder events based on prioritized prompts from analysis
      const prioritizedPromptIds = analysis.prioritizedPrompts || [];

      if (prioritizedPromptIds.length === 0) {
        console.warn(
          "[Planner] Analysis returned empty prioritizedPrompts - using all events as fallback"
        );
      }

      const prioritizedEvents = prioritizedPromptIds
        .map((id: string) => events.find((e) => e.id === id))
        .filter(Boolean); // Remove any null/undefined

      // If no prioritized events (shouldn't happen due to safeguards), fall back to all events
      const eventsToUse =
        prioritizedEvents.length > 0 ? prioritizedEvents : events;

      console.log(
        `[Planner] Using ${eventsToUse.length} prioritized events out of ${events.length} total`
      );

      // Get the latest design spec to build upon (for cumulative evolution)
      const { data: latestSpec } = await supabaseAdmin
        .from("design_specs")
        .select("spec_json")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Build explicit priority and conflict context for the planner
      let promptContext = '';

      // Add conflict resolution instructions if there are conflicts
      if (analysis.conflicts && analysis.conflicts.length > 0) {
        promptContext += '\n\nCONFLICT RESOLUTION:\n';
        analysis.conflicts.forEach((conflict: any) => {
          const winnerEvent = eventsToUse.find((e: any) => e.id === conflict.winner);
          const loserIds = conflict.promptIds.filter((id: string) => id !== conflict.winner);
          const loserTexts = loserIds
            .map((id: string) => eventsToUse.find((e: any) => e.id === id)?.text)
            .filter(Boolean);
          
          promptContext += `- "${winnerEvent?.text}" WINS over "${loserTexts.join('", "')}" (${conflict.type})\n`;
          promptContext += `  Reasoning: ${conflict.reasoning}\n`;
          promptContext += `  CRITICAL: Implement the winner's intent, ignore the conflicting aspects of the losers.\n\n`;
        });
      }

      // Add additive group context if prompts work together
      if (analysis.additive && analysis.additive.length > 0) {
        promptContext += '\nADDITIVE PROMPTS (implement all of these together):\n';
        analysis.additive.forEach((group: any, i: number) => {
          const groupTexts = group.promptIds
            .map((id: string) => eventsToUse.find((e: any) => e.id === id)?.text)
            .filter(Boolean);
          promptContext += `Group ${i + 1}: ${group.explanation}\n`;
          groupTexts.forEach((text: string) => {
            promptContext += `  - "${text}"\n`;
          });
          promptContext += '\n';
        });
      }

      // Build the main prompt with priority ordering
      const prompt = `${promptContext}
ALL PROMPTS (in priority order, most important first):
${eventsToUse.map((e: any, i: number) => 
  `${i + 1}. "${e.text || `[${e.kind}]`}"`
).join('\n')}

INSTRUCTIONS: Implement these prompts according to the conflict resolution above. Winners take precedence. Additive prompts should all be included.`;

      const spec = await callGeminiPlanner(
        prompt,
        eventsToUse,
        latestSpec?.spec_json,
        analysis
      );

      // Generate hash
      const specHash = createHash("sha256")
        .update(JSON.stringify(spec))
        .digest("hex");

      // Check if spec already exists
      const { data: existing } = await supabaseAdmin
        .from("design_specs")
        .select("id")
        .eq("spec_hash", specHash)
        .single();

      if (existing) {
        return existing.id;
      }

      // Store new spec with link to analysis
      const { data: newSpec, error } = await supabaseAdmin
        .from("design_specs")
        .insert({
          room_id: roomId,
          spec_json: spec,
          spec_hash: specHash,
          analysis_id: analysisId, // Link to the conflict analysis
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
