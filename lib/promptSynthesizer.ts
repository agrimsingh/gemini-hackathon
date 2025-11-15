import { supabaseAdmin } from '@/lib/supabase/server';
import type { RoomCommand, SynthesizedPrompt } from '@/lib/types';

export async function getRecentCommands(
  roomId: string,
  windowMs: number
): Promise<RoomCommand[]> {
  const cutoffTime = new Date(Date.now() - windowMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from('room_commands')
    .select('*')
    .eq('room_id', roomId)
    .gte('created_at', cutoffTime)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[PromptSynthesizer] Error fetching commands:', error);
    return [];
  }

  return (data || []) as RoomCommand[];
}

export function synthesizePromptFromCommands(
  commands: RoomCommand[]
): SynthesizedPrompt {
  if (commands.length === 0) {
    return {
      summary: '',
      topCommands: [],
      rawCommands: [],
    };
  }

  // Normalize commands: trim, lowercase, collapse whitespace
  const normalized = commands.map((cmd) => ({
    ...cmd,
    normalized: cmd.content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '),
  }));

  // Count frequencies
  const frequencyMap = new Map<string, number>();
  const commandMap = new Map<string, RoomCommand[]>();

  normalized.forEach((cmd) => {
    const key = cmd.normalized;
    const count = (frequencyMap.get(key) || 0) + 1;
    frequencyMap.set(key, count);

    if (!commandMap.has(key)) {
      commandMap.set(key, []);
    }
    commandMap.get(key)!.push(cmd);
  });

  // Sort by frequency (descending)
  const sorted = Array.from(frequencyMap.entries())
    .map(([text, count]) => ({
      text: commandMap.get(text)![0].content, // Use original casing from first occurrence
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Filter out low-frequency commands (optional threshold)
  const minSupport = Math.max(1, Math.floor(commands.length * 0.1)); // At least 10% support
  const topCommands = sorted.filter((cmd) => cmd.count >= minSupport);

  // Build summary
  const top3 = topCommands.slice(0, 3);
  let summary = '';

  if (top3.length === 0) {
    summary = 'No clear consensus in recent commands.';
  } else if (top3.length === 1) {
    summary = `The crowd unanimously requested: "${top3[0].text}"`;
  } else if (top3.length === 2) {
    summary = `Top requests: "${top3[0].text}" (${top3[0].count}x) and "${top3[1].text}" (${top3[1].count}x)`;
  } else {
    summary = `Top requests: "${top3[0].text}" (${top3[0].count}x), "${top3[1].text}" (${top3[1].count}x), "${top3[2].text}" (${top3[2].count}x)`;
  }

  // Add context about total participation
  summary += `\n\nTotal commands in this interval: ${commands.length}. Honor the highest-frequency commands first; ignore obviously conflicting or low-frequency ones.`;

  return {
    summary,
    topCommands,
    rawCommands: commands.map((c) => c.content),
  };
}

export async function buildSynthesizedPrompt(
  roomId: string,
  windowMs: number = 5000
): Promise<SynthesizedPrompt> {
  const commands = await getRecentCommands(roomId, windowMs);
  return synthesizePromptFromCommands(commands);
}

