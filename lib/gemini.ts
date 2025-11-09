import { GoogleGenerativeAI } from "@google/generative-ai";
import type { PromptEvent } from "./types";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set - Gemini features will not work");
}

export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function callGeminiPlanner(
  prompt: string,
  recentEvents: any[],
  currentSpec?: any,
  conflictAnalysis?: any
) {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const contextPrompt = currentSpec
    ? `Current design state:\n${JSON.stringify(
        currentSpec,
        null,
        2
      )}\n\nYour task: BLEND the new prompts with the existing design. DO NOT discard existing components unless explicitly contradicted. Show tensions between different participants' visions.\n\n`
    : "";

  const analysisContext = conflictAnalysis
    ? `\n\nCONFLICT ANALYSIS RESULTS:\nThe prompts have been analyzed and prioritized. The following list is in order of priority (highest first):\n${JSON.stringify(
        conflictAnalysis,
        null,
        2
      )}\n\nIMPORTANT: These prompts are already prioritized based on conflict resolution. Focus on implementing the higher-priority prompts. If prompts conflict, the analysis has already determined winners - respect those decisions.\n\n`
    : "";

  const systemPrompt = `You are a design planner for a collaborative sandbox. Given multiple user inputs (potentially conflicting), synthesize a unified DesignSpec JSON that BLENDS all ideas.

${contextPrompt}${analysisContext}

DesignSpec format:
{
  "specId": "hash",
  "palette": { "bg": "#hex", "fg": "#hex", "accent": ["#hex", ...] },
  "layout": { "kind": "landing|gallery|dashboard", "sections": [...] },
  "components": [{ "path": "string", "type": "string", "props": {} }],
  "tensions": [{ "participantId": "string", "weight": 0-1, "reason": "string" }],
  "themeVars": {}
}

CRITICAL: 
- If a current design exists, MERGE new ideas with existing components
- Assign tension weights showing whose ideas dominated
- Only remove components if explicitly contradicted by new prompts
- The "components" array should include ALL components (existing + new)
- If conflict analysis is provided, prioritize prompts in the order given
- Prompts marked as "winners" in conflicts should be fully implemented
- Prompts that lost conflicts can be ignored or implemented with lower tension weights

Return ONLY valid JSON, no markdown.`;

  const promptText = `${systemPrompt}\n\nRecent events:\n${JSON.stringify(
    recentEvents,
    null,
    2
  )}\n\nUser prompt: ${prompt}\n\nDesignSpec:`;

  const result = await model.generateContent(promptText);
  const response = await result.response;
  const text = response.text();

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]);
}

export async function callGeminiBuilder(designSpec: any, currentHtml?: string) {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const contextSection = currentHtml
    ? `\n\nCURRENT HTML STATE:\n${currentHtml}\n\nYour task: PRESERVE and ENHANCE the existing HTML. Add new features from the spec without removing existing ones unless explicitly contradicted.\n`
    : "";

  const componentsSection =
    designSpec.components && designSpec.components.length > 0
      ? `\n\nCOMPONENTS YOU MUST INCLUDE (from DesignSpec):\n${designSpec.components
          .map(
            (c: any, i: number) =>
              `${i + 1}. ${c.type} (path: ${c.path}, props: ${JSON.stringify(
                c.props
              )})`
          )
          .join(
            "\n"
          )}\n\nCRITICAL: Every component listed above MUST appear in your generated HTML. Do not skip any.\n`
      : "";

  const tensionsSection =
    designSpec.tensions && designSpec.tensions.length > 0
      ? `\n\nTENSIONS (use these to determine visual prominence):\n${designSpec.tensions
          .map(
            (t: any) =>
              `- Participant ${t.participantId}: weight ${t.weight} (${
                t.reason || "no reason"
              })`
          )
          .join(
            "\n"
          )}\n\nUse weights to determine styling: higher weight = more prominent/larger/brighter features.\n`
      : "";

  const systemPrompt = `You are a code builder. Convert a DesignSpec into FilePatch JSON for a vanilla HTML/CSS/JS app.${contextSection}${componentsSection}${tensionsSection}

FilePatch format:
{
  "baseSpecId": "string",
  "ops": [
    { "op": "setFile", "path": "string", "content": "string" },
    { "op": "deleteFile", "path": "string" },
    { "op": "mkdir", "path": "string" }
  ]
}

CRITICAL REQUIREMENTS:
1. Generate vanilla HTML/CSS/JavaScript - NO React, NO frameworks
2. ALWAYS create/update "index.html" as the main entry point
3. INCLUDE ALL COMPONENTS from the DesignSpec.components array - this is mandatory
4. If current HTML exists, PRESERVE existing features unless explicitly contradicted
5. Use DesignSpec.palette colors in your styles
6. Use tensions weights to determine visual prominence (size, opacity, z-index, etc.)
7. Create a single-page app that's immediately visible
8. Use modern ES6+ JavaScript in <script> tags
9. Return ONLY valid JSON, no markdown or code fences

Example structure:
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <style>
    body { font-family: system-ui; margin: 0; padding: 20px; background: [use palette.bg]; }
    /* Style each component based on tensions weights */
  </style>
</head>
<body>
  <div id="app">
    <!-- MUST include HTML for EVERY component in DesignSpec.components -->
  </div>
  <script>
    // Add interactivity for all components
  </script>
</body>
</html>`;

  const promptText = `${systemPrompt}\n\nDesignSpec:\n${JSON.stringify(
    designSpec,
    null,
    2
  )}\n\nFilePatch:`;

  const result = await model.generateContent(promptText);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]);
}

export async function* callGeminiConflictAnalyzer(
  events: PromptEvent[],
  currentSpec?: any
) {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const contextPrompt = currentSpec
    ? `\n\nCURRENT APP STATE:\n${JSON.stringify(
        currentSpec,
        null,
        2
      )}\n\nConsider how new prompts fit with or contradict the existing design.\n`
    : "\n\nNo current design exists yet - this is a fresh start.\n";

  const eventsText = events
    .map(
      (e, i) =>
        `[${i + 1}] Participant ${e.participant_id} at ${e.created_at}: ${
          e.text || `[${e.kind}]`
        }`
    )
    .join("\n");

  const systemPrompt = `You are analyzing user prompts in a collaborative design tool to detect conflicts and determine priorities.

${contextPrompt}

RECENT PROMPTS (in chronological order, [1] = first submitted):
${eventsText}

YOUR TASK:
1. Determine if these prompts are ADDITIVE (can coexist) or CONFLICTING (mutually exclusive/contradictory)
2. For conflicts, decide which prompt should take priority based on:
   - Coherence with existing app state
   - Feasibility
   - How fundamental the change is
   - Timing (when in doubt, first prompt may have priority, but not always!)
3. Think through your reasoning step by step
4. Provide a clear decision

CRITICAL RULES - YOU MUST FOLLOW THESE:
✓ ALWAYS prioritize at least one prompt - never leave all prompts unimplemented
✓ PREFER additive/collaborative solutions over conflicts when possible
✓ If prompts seem conflicting, first consider if they can coexist with tension (e.g., "make it blue" + "make it red" = gradient or split design)
✓ Only mark as "mutually-exclusive" if truly impossible to combine (e.g., "todo app" vs "weather app" as core purpose)
✓ When marking conflicts, ALWAYS choose a winner - never leave winner empty
✓ The "prioritizedPrompts" array MUST include ALL prompt IDs in priority order (highest first)
✓ Empty arrays are NOT allowed - there must always be a decision

EXAMPLES OF GOOD DECISIONS:
- "make it blue" + "add a button" → ADDITIVE (different concerns)
- "make it blue" + "make it red" → COMPATIBLE-WITH-TENSION (use both colors creatively)
- "build todo app" + "build weather app" → MUTUALLY-EXCLUSIVE (pick one based on context)

RESPONSE FORMAT (return ONLY valid JSON at the end):
{
  "additive": [
    {
      "promptIds": [1, 2],
      "explanation": "These prompts work together because..."
    }
  ],
  "conflicts": [
    {
      "promptIds": [1, 2],
      "type": "mutually-exclusive" | "contradictory",
      "winner": 1,
      "reasoning": "Choosing prompt 1 because...",
      "confidence": 0.85
    }
  ],
  "prioritizedPrompts": [1, 2, 3]
}

IMPORTANT: 
- Use prompt numbers (1, 2, 3...) in your JSON, not IDs
- Show your thinking process first, then provide the JSON decision at the end
- NEVER return empty prioritizedPrompts - it MUST contain all prompts in priority order`;

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      // @ts-ignore - thinkingConfig is part of generationConfig
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  let thinkingTrace = "";
  let finalAnswer = "";

  for await (const chunk of result.stream) {
    const candidate = chunk.candidates?.[0];
    if (!candidate?.content?.parts) continue;

    for (const part of candidate.content.parts) {
      // @ts-ignore - thought field exists but might not be in types
      const isThought = part.thought === true;
      const text = part.text || "";

      if (isThought) {
        thinkingTrace += text;
        yield { type: "thinking" as const, text };
      } else {
        finalAnswer += text;
        yield { type: "answer" as const, text };
      }
    }
  }

  // Extract JSON from final answer
  const jsonMatch = finalAnswer.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in conflict analyzer response");
  }

  const analysis = JSON.parse(jsonMatch[0]);

  // Map prompt indices to actual IDs
  const mappedAnalysis = {
    additive:
      analysis.additive?.map((group: any) => ({
        ...group,
        promptIds: group.promptIds.map((idx: number | string) => {
          const index = typeof idx === "string" ? parseInt(idx) - 1 : idx - 1;
          return events[index]?.id || idx;
        }),
      })) || [],
    conflicts:
      analysis.conflicts?.map((conflict: any) => ({
        ...conflict,
        promptIds: conflict.promptIds.map((idx: number | string) => {
          const index = typeof idx === "string" ? parseInt(idx) - 1 : idx - 1;
          return events[index]?.id || idx;
        }),
        winner:
          typeof conflict.winner === "number" || !isNaN(Number(conflict.winner))
            ? events[Number(conflict.winner) - 1]?.id || conflict.winner
            : conflict.winner,
      })) || [],
    prioritizedPrompts:
      analysis.prioritizedPrompts?.map((idx: number | string) => {
        const index = typeof idx === "string" ? parseInt(idx) - 1 : idx - 1;
        return events[index]?.id || idx;
      }) || [],
  };

  // CRITICAL SAFEGUARD: Ensure prioritizedPrompts is never empty
  // If Gemini somehow returns empty array, fall back to all events in order
  if (mappedAnalysis.prioritizedPrompts.length === 0) {
    console.warn(
      "[ConflictAnalyzer] Empty prioritizedPrompts - using fallback (all events in order)"
    );
    mappedAnalysis.prioritizedPrompts = events.map((e) => e.id);
  }

  yield {
    type: "complete" as const,
    analysis: mappedAnalysis,
    thinkingTrace,
    fullAnswer: finalAnswer,
  };
}
