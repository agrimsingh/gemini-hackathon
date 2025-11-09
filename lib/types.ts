export type DesignSpec = {
  specId: string; // hash for dedupe
  palette: { bg: string; fg: string; accent: string[] };
  layout: {
    kind: 'landing' | 'gallery' | 'dashboard';
    sections: Array<{ id: string; type: string; props: Record<string, any> }>;
  };
  components: Array<{ path: string; type: string; props: Record<string, any> }>;
  tensions: Array<{ participantId: string; weight: number; reason?: string }>;
  themeVars?: Record<string, string>; // css vars to tween
};

export type FilePatch = {
  baseSpecId: string; // ties to DesignSpec
  ops: Array<
    | { op: 'setFile'; path: string; content: string }
    | { op: 'deleteFile'; path: string }
    | { op: 'mkdir'; path: string }
  >;
};

export type Participant = {
  id: string;
  room_id: string;
  display_name: string;
  color: string;
  weight: number;
  avatar_url: string | null;
};

export type PromptEvent = {
  id: string;
  room_id: string;
  participant_id: string;
  kind: 'text' | 'image' | 'audio';
  text: string | null;
  payload_url: string | null;
  created_at: string;
};

export type ConflictInfo = {
  promptIds: string[];
  type: 'mutually-exclusive' | 'contradictory';
  winner: string; // prompt id that won
  reasoning: string;
  confidence: number; // 0-1
};

export type AdditiveGroup = {
  promptIds: string[];
  explanation: string;
};

export type PromptAnalysis = {
  id: string;
  room_id: string;
  created_at: string;
  prompt_event_ids: string[];
  analysis_json: {
    additive: AdditiveGroup[];
    conflicts: ConflictInfo[];
    prioritizedPrompts: string[]; // ordered by priority
  };
  thinking_trace: string; // raw thinking from Gemini
};

