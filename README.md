# Vibe de Deux

A multiplayer collaborative coding platform where multiple participants simultaneously submit prompts, and AI intelligently synthesizes their ideas into a working web application. Built for real-time collaboration with conflict resolution, priority management, and live presence awareness.

## Purpose

Vibe de Deux enables teams to collaboratively build web applications through natural language prompts. Unlike traditional pair programming or code review workflows, this platform allows multiple people to contribute ideas simultaneously without blocking each other. The AI acts as a mediator, analyzing conflicts, prioritizing requests, and synthesizing a unified design that respects everyone's contributions.

## Core Concept: Collaborative vs Conflicting Prompts

The platform's intelligence lies in understanding when prompts are **collaborative** (additive) versus **conflicting**, and how to prioritize them.

### Collaborative (Additive) Prompts

Prompts are considered **additive** when they can coexist without contradiction. Examples:
- "Make it blue" + "Add a button" → Different concerns, both can be implemented
- "Add a header" + "Add a footer" → Complementary features
- "Make it responsive" + "Add dark mode" → Independent enhancements

When prompts are additive, the AI implements all of them together, creating a richer final product.

### Conflicting Prompts

Conflicts occur when prompts are **mutually exclusive** or **contradictory**:

- **Mutually Exclusive**: "Build a todo app" vs "Build a weather app" → Core purpose conflict
- **Contradictory**: "Make it minimalist" vs "Add lots of features" → Design philosophy clash

However, the AI is smart about conflicts. Even seemingly contradictory prompts like "make it blue" + "make it red" can be resolved creatively (e.g., gradients, split designs, or theme variations) rather than being marked as mutually exclusive.

### Prioritization Strategy

When conflicts are detected, the AI prioritizes prompts based on:

1. **Coherence with existing app state** - Does the prompt align with what's already built?
2. **Feasibility** - Can this be implemented effectively?
3. **Fundamental importance** - Is this a core feature or a stylistic preference?
4. **Timing** - When was the prompt submitted? (First prompt may have priority, but not always)

The conflict analyzer always produces a prioritized list of prompts, ensuring that at least one prompt is implemented. Winners of conflicts are fully implemented, while losing prompts may be ignored or implemented with lower visual prominence (via "tension weights").

### Tension Weights

When prompts can coexist but have different priorities, the system uses **tension weights** (0-1) to determine visual prominence. Higher weights result in:
- Larger components
- More prominent colors
- Higher z-index positioning
- Brighter/more visible styling

This allows the AI to blend competing visions while respecting priority.

## Gemini AI Integration

The platform uses Google's Gemini models in three distinct phases, each optimized for its specific task:

### 1. Conflict Analysis (`gemini-2.5-flash` with Thinking Mode)

**Purpose**: Analyze incoming prompts to detect conflicts and determine priorities.

**Model**: `gemini-2.5-flash` with `thinkingConfig.includeThoughts: true`

**Process**:
- Receives recent prompt events (last 15 seconds or since last analysis)
- Considers current app state for context
- Uses thinking mode to reason through conflicts step-by-step
- Streams thinking process in real-time to users via EventSource
- Produces structured JSON with:
  - `additive`: Groups of prompts that work together
  - `conflicts`: Array of conflicts with winners, reasoning, and confidence scores
  - `prioritizedPrompts`: Ordered list of all prompt IDs by priority

**Key Features**:
- **Streaming thinking trace**: Users see the AI's reasoning process in real-time
- **Safeguards**: Always produces a prioritized list (never empty)
- **Context-aware**: Considers existing design state when analyzing conflicts
- **Creative resolution**: Prefers additive solutions over conflicts when possible

**Example Output**:
```json
{
  "additive": [
    {
      "promptIds": ["id1", "id2"],
      "explanation": "These prompts work together because..."
    }
  ],
  "conflicts": [
    {
      "promptIds": ["id3", "id4"],
      "type": "mutually-exclusive",
      "winner": "id3",
      "reasoning": "Choosing prompt 3 because...",
      "confidence": 0.85
    }
  ],
  "prioritizedPrompts": ["id3", "id1", "id2", "id4"]
}
```

### 2. Design Planning (`gemini-2.5-flash`)

**Purpose**: Synthesize prioritized prompts into a unified DesignSpec JSON.

**Model**: `gemini-2.5-flash`

**Process**:
- Receives conflict analysis results (prioritized prompts, conflicts, additive groups)
- Takes current design spec as context (for cumulative evolution)
- Blends all prompts into a unified DesignSpec that includes:
  - Color palette (bg, fg, accent colors)
  - Layout structure (landing/gallery/dashboard)
  - Component specifications (path, type, props)
  - Tension weights per participant
  - CSS theme variables

**Key Features**:
- **Cumulative evolution**: Preserves existing components unless explicitly contradicted
- **Tension modeling**: Assigns weights showing whose ideas dominated
- **Conflict-aware**: Respects conflict analysis winners and losers
- **Additive synthesis**: Implements all additive prompts together

**DesignSpec Structure**:
```json
{
  "specId": "hash",
  "palette": { "bg": "#hex", "fg": "#hex", "accent": ["#hex"] },
  "layout": { "kind": "landing", "sections": [...] },
  "components": [{ "path": "string", "type": "string", "props": {} }],
  "tensions": [{ "participantId": "string", "weight": 0.7, "reason": "..." }],
  "themeVars": {}
}
```

### 3. Code Generation (`gemini-2.5-flash-lite`)

**Purpose**: Convert DesignSpec into executable HTML/CSS/JavaScript code.

**Model**: `gemini-2.5-flash-lite`

**Process**:
- Receives DesignSpec JSON
- Takes current HTML state for context (to preserve existing features)
- Generates FilePatch JSON with file operations:
  - `setFile`: Create or update files
  - `deleteFile`: Remove files
  - `mkdir`: Create directories

**Key Features**:
- **Vanilla web stack**: Generates pure HTML/CSS/JS (no frameworks)
- **Component enforcement**: Validates that all DesignSpec components are included
- **Incremental updates**: Preserves existing HTML unless contradicted
- **Tension-based styling**: Uses tension weights for visual prominence

**FilePatch Structure**:
```json
{
  "baseSpecId": "hash",
  "ops": [
    { "op": "setFile", "path": "index.html", "content": "<!DOCTYPE html>..." },
    { "op": "setFile", "path": "styles.css", "content": "..." }
  ]
}
```

### Workflow Pipeline

1. **User submits prompt** → Stored in `prompt_events` table
2. **Batch collection** → Prompts collected for 10 seconds or until 2nd prompt arrives
3. **Conflict analysis** → Gemini analyzes prompts (streaming thinking trace)
4. **Design planning** → Gemini creates unified DesignSpec
5. **Code generation** → Gemini generates FilePatch
6. **File application** → Patches applied to `files` table
7. **Live preview** → All clients see updates via Supabase Realtime

## Supabase Realtime Integration

Supabase Realtime powers the collaborative experience, enabling instant synchronization across all connected clients.

### Presence Tracking

**Channel**: `room:{roomId}:presence`

**Features**:
- Real-time user presence (who's online)
- Typing indicators
- Last action timestamps
- Per-participant colors and display names
- Automatic cleanup on disconnect

**Implementation**: Uses Supabase Presence API with `channel.track()` for state updates and `presence` event listeners for sync/join/leave events.

### Postgres Change Subscriptions

The platform subscribes to database changes for instant updates:

1. **Prompt Events** (`prompt_events` table)
   - Channels: `room:{roomId}:activity-prompts`, `room:{roomId}:events`
   - Triggers: Activity feed updates, analysis triggers
   - Used by: ActivityFeed, ThinkingDisplay, plannerHook

2. **Prompt Analyses** (`prompt_analyses` table)
   - Channel: `room:{roomId}:activity-analyses`
   - Signals: New batch analysis complete
   - Used by: ActivityFeed, ThinkingDisplay

3. **Design Specs** (`design_specs` table)
   - Channel: `room:{roomId}:activity-specs`, `room:{roomId}:specs`
   - Triggers: Theme variable application
   - Used by: ActivityFeed

4. **Patches** (`patches` table)
   - Channel: `room:{roomId}:activity-patches`, `room:{roomId}:patches`
   - Triggers: File updates, preview refresh
   - Used by: ActivityFeed, PreviewSandbox

5. **Participants** (`participants` table)
   - Channel: `room:{roomId}:participants`
   - Triggers: Participant list updates
   - Used by: RoomPage, PresenceRings

### Broadcast Channels

**AI Status Updates** (`room:{roomId}:ai`)
- Broadcasts AI phase changes (planning started/completed, building started/completed)
- Includes progress percentages
- Used by: AIStatusTimeline component

**Planner Triggers** (`room:{roomId}:planner-trigger`)
- Listens for new prompt events
- Implements batching logic (10s window or 2nd event)
- Triggers planner/builder pipeline

### Real-time Features Enabled

- **Live preview**: All users see code changes instantly
- **Activity feed**: Real-time log of all actions (prompts, analyses, specs, patches)
- **Thinking display**: Streams AI reasoning process as it happens
- **Presence rings**: Visual indicators showing who's active
- **Heatmap overlay**: Dynamic visual weights based on participant contributions
- **Synchronized state**: All clients stay in sync without manual refresh

## Architecture Highlights

- **Batching**: Prompts are batched (10s window or 2nd event) to reduce API calls and improve synthesis quality
- **Deduplication**: Design specs and patches are hash-deduplicated to avoid redundant work
- **Single-flight locks**: Per-room locks prevent concurrent analysis/planning/building
- **Incremental evolution**: Each iteration builds upon the previous design state
- **Conflict resolution**: Structured conflict analysis ensures fair prioritization
- **Tension modeling**: Visual weights allow competing visions to coexist

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **AI**: Google Gemini 2.5 Flash (analysis/planning), Gemini 2.5 Flash Lite (code generation)
- **Database & Realtime**: Supabase (PostgreSQL + Realtime)
- **Styling**: Tailwind CSS
- **UI Components**: Framer Motion, Lucide Icons

## Getting Started

1. Install dependencies: `pnpm install`
2. Set up environment variables:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for admin operations)
3. Run migrations: Apply the SQL migrations in the root directory
4. Start dev server: `pnpm dev`

## Database Schema

Key tables:
- `rooms`: Room instances
- `participants`: Users in rooms (with colors, weights)
- `prompt_events`: User-submitted prompts
- `prompt_analyses`: Conflict analysis results with thinking traces
- `design_specs`: AI-generated design specifications
- `patches`: File operation patches
- `files`: Current file system state

## License

Private project for Gemini Hackathon.

