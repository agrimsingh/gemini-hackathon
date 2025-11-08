import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set - Gemini features will not work');
}

export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function callGeminiPlanner(prompt: string, recentEvents: any[], currentSpec?: any) {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const contextPrompt = currentSpec 
    ? `Current design state:\n${JSON.stringify(currentSpec, null, 2)}\n\nYour task: BLEND the new prompts with the existing design. DO NOT discard existing components unless explicitly contradicted. Show tensions between different participants' visions.\n\n`
    : '';

  const systemPrompt = `You are a design planner for a collaborative sandbox. Given multiple user inputs (potentially conflicting), synthesize a unified DesignSpec JSON that BLENDS all ideas.

${contextPrompt}

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

Return ONLY valid JSON, no markdown.`;

  const promptText = `${systemPrompt}\n\nRecent events:\n${JSON.stringify(recentEvents, null, 2)}\n\nUser prompt: ${prompt}\n\nDesignSpec:`;

  const result = await model.generateContent(promptText);
  const response = await result.response;
  const text = response.text();

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  return JSON.parse(jsonMatch[0]);
}

export async function callGeminiBuilder(designSpec: any, currentHtml?: string) {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');
  
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const contextSection = currentHtml 
    ? `\n\nCURRENT HTML STATE:\n${currentHtml}\n\nYour task: PRESERVE and ENHANCE the existing HTML. Add new features from the spec without removing existing ones unless explicitly contradicted.\n`
    : '';

  const componentsSection = designSpec.components && designSpec.components.length > 0
    ? `\n\nCOMPONENTS YOU MUST INCLUDE (from DesignSpec):\n${designSpec.components.map((c: any, i: number) => `${i + 1}. ${c.type} (path: ${c.path}, props: ${JSON.stringify(c.props)})`).join('\n')}\n\nCRITICAL: Every component listed above MUST appear in your generated HTML. Do not skip any.\n`
    : '';

  const tensionsSection = designSpec.tensions && designSpec.tensions.length > 0
    ? `\n\nTENSIONS (use these to determine visual prominence):\n${designSpec.tensions.map((t: any) => `- Participant ${t.participantId}: weight ${t.weight} (${t.reason || 'no reason'})`).join('\n')}\n\nUse weights to determine styling: higher weight = more prominent/larger/brighter features.\n`
    : '';
  
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

  const promptText = `${systemPrompt}\n\nDesignSpec:\n${JSON.stringify(designSpec, null, 2)}\n\nFilePatch:`;

  const result = await model.generateContent(promptText);
  const response = await result.response;
  const text = response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  
  return JSON.parse(jsonMatch[0]);
}

