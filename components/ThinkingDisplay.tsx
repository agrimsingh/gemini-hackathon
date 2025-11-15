"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { PromptAnalysis, ConflictInfo, AdditiveGroup } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ThinkingDisplayProps {
  roomId: string;
}

export default function ThinkingDisplay({ roomId }: ThinkingDisplayProps) {
  const [latestAnalysis, setLatestAnalysis] = useState<PromptAnalysis | null>(
    null
  );
  const [previousAnalysis, setPreviousAnalysis] =
    useState<PromptAnalysis | null>(null);
  const [streamingThinking, setStreamingThinking] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPreviousExpanded, setIsPreviousExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [batchNumber, setBatchNumber] = useState(1);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    // Subscribe to new prompt events - trigger analysis when new events arrive
    const eventsChannel = supabase
      .channel(`room:${roomId}:events`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prompt_events",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Trigger new analysis stream when new event arrives
          if (!isStreamingRef.current) {
            startStreaming();
          }
        }
      )
      .subscribe();

    // Subscribe to completed analyses
    const analysesChannel = supabase
      .channel(`room:${roomId}:analyses`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prompt_analyses",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          setIsAnimating(false);
          isStreamingRef.current = false;

          // Close any active stream
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

          // Fetch the full analysis
          const { data } = await supabase
            .from("prompt_analyses")
            .select("*")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            // Move current latest to previous only if we have a current analysis
            setLatestAnalysis((prev) => {
              if (prev) {
                setPreviousAnalysis(prev);
                // Only increment batch when we're replacing an existing analysis
                setBatchNumber((num) => num + 1);
              }
              return data as PromptAnalysis;
            });
            setStreamingThinking(""); // Clear streaming text

            // Broadcast analyzing completed
            const analysis = data.analysis_json;
            const aiChannel = supabase.channel(`room:${roomId}:ai`);
            await aiChannel.send({
              type: "broadcast",
              event: "ai_status",
              payload: {
                phase: "analyzing",
                status: "completed",
                percent: 100,
                meta: {
                  conflicts: analysis?.conflicts?.length || 0,
                  additive: analysis?.additive?.length || 0,
                },
              },
            });

            // Auto-collapse after 10 seconds
            setTimeout(() => {
              setIsExpanded(false);
            }, 10000);
          }
        }
      )
      .subscribe();

    // Load the most recent analysis
    async function loadLatest() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) return;

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/prompt_analyses?select=*&room_id=eq.${roomId}&order=created_at.desc&limit=1`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          console.warn(
            "[ThinkingDisplay] Failed to load latest analysis:",
            response.status,
            response.statusText
          );
          return;
        }

        const data = (await response.json()) as PromptAnalysis[];
        if (data?.length) {
          setLatestAnalysis(data[0]);
        }
      } catch (error) {
        console.error("[ThinkingDisplay] Error loading latest analysis:", error);
      }
    }

    loadLatest();

    async function startStreaming() {
      if (isStreamingRef.current || eventSourceRef.current) return;

      isStreamingRef.current = true;
      setIsAnimating(true);
      setIsExpanded(true);
      setStreamingThinking("");

      // Broadcast analyzing started
      const aiChannel = supabase.channel(`room:${roomId}:ai`);
      await aiChannel.send({
        type: "broadcast",
        event: "ai_status",
        payload: {
          phase: "analyzing",
          status: "started",
          percent: 0,
        },
      });

      const eventSource = new EventSource(`/api/rooms/${roomId}/thinking`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "thinking") {
            setStreamingThinking((prev) => {
              const newText = prev + data.text;
              // Update progress based on thinking text length (rough heuristic)
              const progress = Math.min(60, newText.length / 100);
              const aiChannel = supabase.channel(`room:${roomId}:ai`);
              aiChannel.send({
                type: "broadcast",
                event: "ai_status",
                payload: {
                  phase: "analyzing",
                  status: "progress",
                  percent: progress,
                },
              });
              return newText;
            });
          } else if (data.type === "complete") {
            isStreamingRef.current = false;
            eventSource.close();
            eventSourceRef.current = null;

            if (data.analysis) {
              // Analysis completed, will be picked up by DB subscription
            } else {
              setIsAnimating(false);
            }
          }
        } catch (error) {
          console.error("[ThinkingDisplay] Error parsing SSE data:", error);
        }
      };

      eventSource.onerror = (error) => {
        // If we get a 409, analysis is already running - wait for DB update instead
        if (eventSource.readyState === EventSource.CLOSED) {
          // Stream closed - analysis might be running elsewhere
          // We'll get the result via DB subscription
        }
        isStreamingRef.current = false;
        setIsAnimating(false);
        eventSource.close();
        eventSourceRef.current = null;
      };
    }

    // Note: Streaming will be triggered when new prompt events arrive
    // or can be manually triggered if needed

    return () => {
      eventsChannel.unsubscribe();
      analysesChannel.unsubscribe();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [roomId]);

  const thinkingText =
    streamingThinking || latestAnalysis?.thinking_trace || "";
  const analysis_json = latestAnalysis?.analysis_json || null;
  const hasConflicts =
    analysis_json?.conflicts && analysis_json.conflicts.length > 0;
  const hasAdditive =
    analysis_json?.additive && analysis_json.additive.length > 0;

  if (!latestAnalysis && !streamingThinking && !previousAnalysis) {
    return null;
  }

  const renderAnalysisContent = (
    analysis: PromptAnalysis | null,
    thinking: string
  ) => {
    const analysis_json = analysis?.analysis_json || null;
    const hasConflicts =
      analysis_json?.conflicts && analysis_json.conflicts.length > 0;
    const hasAdditive =
      analysis_json?.additive && analysis_json.additive.length > 0;

    return (
      <div className="px-4 pb-4 space-y-4">
        {/* Thinking Trace */}
        {thinking && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-400">
              Reasoning Process
            </h3>
            <div className="bg-[#0c0c0c] rounded-lg p-3 text-sm text-gray-300 max-h-96 overflow-y-auto border border-gray-800">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const language = match ? match[1] : "";
                    return !inline && language ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={language}
                        PreTag="div"
                        className="rounded-md !mt-2 !mb-2"
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-gray-900 px-1.5 py-0.5 rounded text-xs"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-lg font-semibold mb-2 mt-4 first:mt-0">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">
                      {children}
                    </h3>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-gray-300">{children}</li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-gray-700 pl-3 italic my-2">
                      {children}
                    </blockquote>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-200">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => <em className="italic">{children}</em>,
                }}
              >
                {thinking}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Additive Prompts */}
        {hasAdditive && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-green-400 flex items-center gap-2">
              <span className="text-lg">✓</span>
              Additive Prompts
            </h3>
            <div className="space-y-2">
              {analysis_json.additive.map((group: AdditiveGroup, i: number) => (
                <div
                  key={i}
                  className="bg-green-950/20 border border-green-900/30 rounded-lg p-3"
                >
                  <p className="text-sm text-gray-300">{group.explanation}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    {group.promptIds.length} prompt
                    {group.promptIds.length !== 1 ? "s" : ""} combined
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conflicts */}
        {hasConflicts && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-yellow-400 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              Conflicts Detected
            </h3>
            <div className="space-y-2">
              {analysis_json.conflicts.map(
                (conflict: ConflictInfo, i: number) => (
                  <div
                    key={i}
                    className="bg-yellow-950/20 border border-yellow-900/30 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-xs text-yellow-400 font-medium mb-1">
                          {conflict.type === "mutually-exclusive"
                            ? "Mutually Exclusive"
                            : "Contradictory"}
                        </div>
                        <p className="text-sm text-gray-300">
                          {conflict.reasoning}
                        </p>
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {Math.round(conflict.confidence * 100)}% confident
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {analysis && (
          <div className="pt-2 border-t border-gray-800">
            <div className="text-xs text-gray-500">
              Analyzed {analysis_json?.prioritizedPrompts?.length || 0} prompt
              {(analysis_json?.prioritizedPrompts?.length || 0) !== 1
                ? "s"
                : ""}{" "}
              • {new Date(analysis.created_at).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Latest Analysis */}
      <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1f1f1f] transition-colors"
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isAnimating ? "animate-pulse bg-blue-400" : "bg-green-400"
              }`}
            />
            <span className="font-semibold">
              {isAnimating
                ? `Analyzing (1/3) - Batch ${batchNumber}`
                : `Latest Analysis - Batch ${batchNumber}`}
            </span>
          </div>
          <div className="text-gray-400 text-sm">{isExpanded ? "▼" : "▶"}</div>
        </button>

        {/* Content */}
        {isExpanded && renderAnalysisContent(latestAnalysis, thinkingText)}
      </div>

      {/* Previous Analysis */}
      {previousAnalysis && (
        <div className="bg-[#171717] rounded-lg border border-gray-800 overflow-hidden opacity-60">
          <button
            onClick={() => setIsPreviousExpanded(!isPreviousExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1f1f1f] transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="font-semibold text-sm text-gray-400">
                Previous Analysis - Batch {batchNumber - 1}
              </span>
            </div>
            <div className="text-gray-500 text-sm">
              {isPreviousExpanded ? "▼" : "▶"}
            </div>
          </button>

          {isPreviousExpanded &&
            renderAnalysisContent(
              previousAnalysis,
              previousAnalysis.thinking_trace
            )}
        </div>
      )}
    </div>
  );
}
