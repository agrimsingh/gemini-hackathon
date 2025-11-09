import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { callGeminiConflictAnalyzer } from "@/lib/gemini";
import type { PromptEvent } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { analyzerLocks } from "@/lib/analyzerLocks";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  // Check if analyzer is already running - if so, wait for it or return
  if (analyzerLocks.has(roomId)) {
    // Analysis already running, client should wait for DB update
    return new Response("Analysis already in progress", { status: 409 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      
      const sendChunk = (data: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (e) {
            isClosed = true;
          }
        }
      };

      const sendError = (error: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error })}\n\n`));
          } catch (e) {
            isClosed = true;
          }
        }
      };

      try {
        // Get the timestamp of the most recent analysis
        const { data: lastAnalysis } = await supabaseAdmin
          .from("prompt_analyses")
          .select("created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const cutoffTime = lastAnalysis?.created_at
          ? lastAnalysis.created_at
          : new Date(Date.now() - 15000).toISOString();

        const { data: events } = await supabaseAdmin
          .from("prompt_events")
          .select("*")
          .eq("room_id", roomId)
          .gt("created_at", cutoffTime)
          .order("created_at", { ascending: true })
          .limit(50);

        if (!events || events.length === 0) {
          sendChunk(JSON.stringify({ type: "complete", analysis: null }));
          if (!isClosed) {
            isClosed = true;
            controller.close();
          }
          return;
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
            sendChunk(JSON.stringify({ type: "thinking", text: chunk.text }));
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
        const { error } = await supabaseAdmin
          .from("prompt_analyses")
          .insert({
            id: analysisId,
            room_id: roomId,
            prompt_event_ids: events.map((e) => e.id),
            analysis_json: analysis,
            thinking_trace: thinkingTrace,
          });

        if (error) throw error;

        sendChunk(JSON.stringify({ 
          type: "complete", 
          analysisId,
          analysis 
        }));
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      } catch (error) {
        console.error("[Thinking SSE] Error:", error);
        sendError(error instanceof Error ? error.message : "Unknown error");
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      } finally {
        analyzerLocks.delete(roomId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

