'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import type { PromptEvent, PromptAnalysis } from '@/lib/types';

type FlowNode = {
  id: string;
  type: 'prompt_batch' | 'analysis' | 'design_spec';
  timestamp: string;
  participantIds: string[];
  data: any;
};

type FlowEdge = {
  source: string;
  target: string;
  value: number; // weight/contribution
  playerAPercent: number;
  playerBPercent: number;
};

type PlayerScorecard = {
  participantId: string;
  displayName: string;
  color: string;
  totalPrompts: number;
  acceptedPrompts: number;
  acceptanceRate: number;
  additivePrompts: number;
  conflictedPrompts: number;
  wonConflicts: number;
  dominantAreas: string[];
};

type CollaborationMetrics = {
  score: number; // 0-100
  crossPollinationScore: number;
  conflictResolutionRate: number;
  contributionBalance: number;
  explanation: string;
};

export async function generateFinalReport(roomId: string) {
  console.log('[Report] Generating final report for room:', roomId);

  // Fetch all data for the room
  const [
    { data: promptEvents },
    { data: promptAnalyses },
    { data: designSpecs },
    { data: participants },
  ] = await Promise.all([
    supabaseAdmin
      .from('prompt_events')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('prompt_analyses')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('design_specs')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('participants')
      .select('*')
      .eq('room_id', roomId),
  ]);

  if (!promptEvents || !participants) {
    throw new Error('Failed to fetch room data');
  }

  // Deduplicate participants by display_name (keep most recent)
  const uniqueParticipants = Array.from(
    new Map(participants.map((p) => [p.display_name, p])).values()
  );

  // Build flow tree
  const flowTree = buildFlowTree(
    promptEvents,
    promptAnalyses || [],
    designSpecs || []
  );

  // Calculate player scorecards
  const scorecards = calculatePlayerScorecards(
    promptEvents,
    promptAnalyses || [],
    uniqueParticipants
  );

  // Calculate collaboration metrics
  const collaboration = calculateCollaborationMetrics(
    promptEvents,
    promptAnalyses || [],
    uniqueParticipants,
    scorecards
  );

  // Get the final (most recent) design spec
  const finalSpec = designSpecs && designSpecs.length > 0
    ? designSpecs[designSpecs.length - 1].spec_json
    : null;

  return {
    flowTree,
    scorecards,
    collaboration,
    rawData: {
      totalPrompts: promptEvents.length,
      totalAnalyses: promptAnalyses?.length || 0,
      totalSpecs: designSpecs?.length || 0,
      participants: uniqueParticipants.map(p => ({
        id: p.id,
        name: p.display_name,
        color: p.color,
      })),
    },
    finalSpec,
  };
}

function buildFlowTree(
  events: PromptEvent[],
  analyses: PromptAnalysis[],
  specs: any[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // Group events by analysis batch
  const eventToAnalysis = new Map<string, string>();
  analyses.forEach((analysis) => {
    analysis.prompt_event_ids.forEach((eventId) => {
      eventToAnalysis.set(eventId, analysis.id);
    });
  });

  // Create nodes for each analysis (prompt batch)
  analyses.forEach((analysis, idx) => {
    const batchEvents = events.filter((e) =>
      analysis.prompt_event_ids.includes(e.id)
    );
    const participantIds = [...new Set(batchEvents.map((e) => e.participant_id))];

    nodes.push({
      id: `batch-${analysis.id}`,
      type: 'prompt_batch',
      timestamp: analysis.created_at,
      participantIds,
      data: {
        eventCount: batchEvents.length,
        events: batchEvents,
        analysis: analysis.analysis_json,
      },
    });

    // Create node for analysis result
    nodes.push({
      id: `analysis-${analysis.id}`,
      type: 'analysis',
      timestamp: analysis.created_at,
      participantIds,
      data: {
        conflicts: analysis.analysis_json.conflicts || [],
        additive: analysis.analysis_json.additive || [],
      },
    });

    // Edge from batch to analysis
    const playerCounts = countPlayerContributions(batchEvents);
    edges.push({
      source: `batch-${analysis.id}`,
      target: `analysis-${analysis.id}`,
      value: batchEvents.length,
      playerAPercent: playerCounts.percentA,
      playerBPercent: playerCounts.percentB,
    });
  });

  // Create nodes for design specs and link to analyses
  specs.forEach((spec) => {
    const analysisId = spec.analysis_id;
    if (analysisId) {
      const analysis = analyses.find((a) => a.id === analysisId);
      if (analysis) {
        const batchEvents = events.filter((e) =>
          analysis.prompt_event_ids.includes(e.id)
        );
        const participantIds = [...new Set(batchEvents.map((e) => e.participant_id))];

        nodes.push({
          id: `spec-${spec.id}`,
          type: 'design_spec',
          timestamp: spec.created_at,
          participantIds,
          data: {
            specHash: spec.spec_hash,
          },
        });

        const playerCounts = countPlayerContributions(batchEvents);
        edges.push({
          source: `analysis-${analysisId}`,
          target: `spec-${spec.id}`,
          value: batchEvents.length,
          playerAPercent: playerCounts.percentA,
          playerBPercent: playerCounts.percentB,
        });
      }
    }
  });

  return { nodes, edges };
}

function countPlayerContributions(events: PromptEvent[]): {
  percentA: number;
  percentB: number;
} {
  if (events.length === 0) return { percentA: 50, percentB: 50 };

  const playerIds = [...new Set(events.map((e) => e.participant_id))];
  if (playerIds.length === 1) {
    return { percentA: 100, percentB: 0 };
  }

  const [playerA, playerB] = playerIds;
  const countA = events.filter((e) => e.participant_id === playerA).length;
  const countB = events.filter((e) => e.participant_id === playerB).length;
  const total = countA + countB;

  return {
    percentA: (countA / total) * 100,
    percentB: (countB / total) * 100,
  };
}

function calculatePlayerScorecards(
  events: PromptEvent[],
  analyses: PromptAnalysis[],
  participants: any[]
): PlayerScorecard[] {
  return participants.map((participant) => {
    const participantEvents = events.filter(
      (e) => e.participant_id === participant.id
    );

    // Use Sets to track unique prompt IDs (prevents double counting)
    const acceptedPromptIds = new Set<string>();
    const additivePromptIds = new Set<string>();
    const conflictedPromptIds = new Set<string>();
    const wonConflictIds = new Set<string>();

    analyses.forEach((analysis) => {
      const analysisJson = analysis.analysis_json;
      const participantEventIds = participantEvents.map((e) => e.id);

      // Check prioritized prompts
      if (analysisJson.prioritizedPrompts) {
        participantEventIds.forEach((eventId) => {
          if (analysisJson.prioritizedPrompts.includes(eventId)) {
            acceptedPromptIds.add(eventId);
          }
        });
      }

      // Check additive groups
      if (analysisJson.additive) {
        analysisJson.additive.forEach((group: any) => {
          participantEventIds.forEach((eventId) => {
            if (group.promptIds.includes(eventId)) {
              additivePromptIds.add(eventId);
            }
          });
        });
      }

      // Check conflicts
      if (analysisJson.conflicts) {
        analysisJson.conflicts.forEach((conflict: any) => {
          participantEventIds.forEach((eventId) => {
            if (conflict.promptIds.includes(eventId)) {
              conflictedPromptIds.add(eventId);
              if (conflict.winner === eventId) {
                wonConflictIds.add(eventId);
              }
            }
          });
        });
      }
    });

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      color: participant.color,
      totalPrompts: participantEvents.length,
      acceptedPrompts: acceptedPromptIds.size,
      acceptanceRate:
        participantEvents.length > 0
          ? (acceptedPromptIds.size / participantEvents.length) * 100
          : 0,
      additivePrompts: additivePromptIds.size,
      conflictedPrompts: conflictedPromptIds.size,
      wonConflicts: wonConflictIds.size,
      dominantAreas: [], // Could be enhanced to track which sections they contributed to most
    };
  });
}

function calculateCollaborationMetrics(
  events: PromptEvent[],
  analyses: PromptAnalysis[],
  participants: any[],
  scorecards: PlayerScorecard[]
): CollaborationMetrics {
  if (participants.length < 2) {
    return {
      score: 0,
      crossPollinationScore: 0,
      conflictResolutionRate: 0,
      contributionBalance: 0,
      explanation: 'Not enough participants to measure collaboration',
    };
  }

  // 1. Cross-pollination: How often do prompts build on each other across players
  let crossPollinationScore = 0;
  let totalAdditiveGroups = 0;
  let mixedAdditiveGroups = 0;

  analyses.forEach((analysis) => {
    const analysisJson = analysis.analysis_json;
    if (analysisJson.additive) {
      analysisJson.additive.forEach((group: any) => {
        totalAdditiveGroups++;
        const groupEvents = events.filter((e) =>
          group.promptIds.includes(e.id)
        );
        const uniqueParticipants = new Set(
          groupEvents.map((e) => e.participant_id)
        );
        if (uniqueParticipants.size > 1) {
          mixedAdditiveGroups++;
        }
      });
    }
  });

  if (totalAdditiveGroups > 0) {
    crossPollinationScore = (mixedAdditiveGroups / totalAdditiveGroups) * 100;
  }

  // 2. Conflict resolution rate: How smoothly conflicts were resolved
  let totalConflicts = 0;
  let highConfidenceResolutions = 0;

  analyses.forEach((analysis) => {
    const analysisJson = analysis.analysis_json;
    if (analysisJson.conflicts) {
      analysisJson.conflicts.forEach((conflict: any) => {
        totalConflicts++;
        if (conflict.confidence > 0.7) {
          highConfidenceResolutions++;
        }
      });
    }
  });

  const conflictResolutionRate =
    totalConflicts > 0 ? (highConfidenceResolutions / totalConflicts) * 100 : 100;

  // 3. Contribution balance: How evenly distributed the work was
  const totalPrompts = events.length;
  const promptCounts = scorecards.map((s) => s.totalPrompts);
  const avgPrompts = totalPrompts / participants.length;
  const variance =
    promptCounts.reduce((sum, count) => sum + Math.pow(count - avgPrompts, 2), 0) /
    participants.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = avgPrompts > 0 ? stdDev / avgPrompts : 0;
  
  // Lower variation = better balance (invert and scale to 0-100)
  const contributionBalance = Math.max(0, 100 - coefficientOfVariation * 100);

  // Overall score (weighted average)
  const score = Math.round(
    crossPollinationScore * 0.4 +
      conflictResolutionRate * 0.3 +
      contributionBalance * 0.3
  );

  // Generate explanation
  let explanation = '';
  if (score >= 80) {
    explanation = `Excellent collaboration! Players built on each other's ideas frequently (${Math.round(crossPollinationScore)}% of work was collaborative), resolved conflicts smoothly, and contributed relatively equally.`;
  } else if (score >= 60) {
    explanation = `Good collaboration with some areas for improvement. ${mixedAdditiveGroups} out of ${totalAdditiveGroups} idea groups involved both players working together.`;
  } else if (score >= 40) {
    explanation = `Moderate collaboration. Players worked somewhat independently with ${Math.round(crossPollinationScore)}% cross-pollination and ${Math.round(contributionBalance)}% contribution balance.`;
  } else {
    explanation = `Limited collaboration detected. Players mostly worked independently with minimal building on each other's ideas.`;
  }

  return {
    score,
    crossPollinationScore,
    conflictResolutionRate,
    contributionBalance,
    explanation,
  };
}

