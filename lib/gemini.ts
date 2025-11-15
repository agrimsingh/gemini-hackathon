import type { PromptEvent } from "./types";
import {
  callClaudePlanner,
  callClaudeBuilder,
  callClaudeConflictAnalyzer,
} from "./claudeClient";

// Legacy: Keep genAI export for compatibility, but it's no longer used
export const genAI = null;

/**
 * Legacy function name - now uses Claude via Vertex AI
 * See lib/claudeClient.ts for implementation
 */
export async function callGeminiPlanner(
  prompt: string,
  recentEvents: any[],
  currentSpec?: any,
  conflictAnalysis?: any
) {
  return callClaudePlanner(prompt, recentEvents, currentSpec, conflictAnalysis);
}

/**
 * Legacy function name - now uses Claude via Vertex AI
 * See lib/claudeClient.ts for implementation
 */
export async function callGeminiBuilder(designSpec: any, currentHtml?: string) {
  return callClaudeBuilder(designSpec, currentHtml);
}

/**
 * Legacy function name - now uses Claude via Vertex AI
 * See lib/claudeClient.ts for implementation
 */
export async function* callGeminiConflictAnalyzer(
  events: PromptEvent[],
  currentSpec?: any
) {
  yield* callClaudeConflictAnalyzer(events, currentSpec);
}
