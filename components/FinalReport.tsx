'use client';

import { useState } from 'react';
import FlowVisualization from './FlowVisualization';

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
  score: number;
  crossPollinationScore: number;
  conflictResolutionRate: number;
  contributionBalance: number;
  explanation: string;
};

interface FinalReportProps {
  reportData: {
    flowTree: {
      nodes: any[];
      edges: any[];
    };
    scorecards: PlayerScorecard[];
    collaboration: CollaborationMetrics;
    rawData: {
      totalPrompts: number;
      totalAnalyses: number;
      totalSpecs: number;
      participants: Array<{ id: string; name: string; color: string }>;
    };
    finalSpec?: any; // The final design spec
  };
  onClose: () => void;
}

export default function FinalReport({ reportData, onClose }: FinalReportProps) {
  const [activeTab, setActiveTab] = useState<'flow' | 'analysis' | 'scorecard' | 'collaboration'>('flow');

  const { flowTree, scorecards, collaboration, rawData } = reportData;

  return (
    <div className="fixed inset-0 bg-[#0c0c0c] z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-[#171717] border-b border-gray-800 p-6 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Final Report</h1>
            <p className="text-sm text-gray-400 mt-1">
              {rawData.totalPrompts} prompts • {rawData.totalAnalyses} analyses • {rawData.totalSpecs} specs
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#0c0c0c] border border-gray-800 rounded-lg hover:bg-[#1f1f1f]"
          >
            Close
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('flow')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'flow'
                ? 'bg-white text-black'
                : 'bg-[#0c0c0c] border border-gray-800 hover:bg-[#1f1f1f]'
            }`}
          >
            Flow
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'analysis'
                ? 'bg-white text-black'
                : 'bg-[#0c0c0c] border border-gray-800 hover:bg-[#1f1f1f]'
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'scorecard'
                ? 'bg-white text-black'
                : 'bg-[#0c0c0c] border border-gray-800 hover:bg-[#1f1f1f]'
            }`}
          >
            Scorecard
          </button>
          <button
            onClick={() => setActiveTab('collaboration')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'collaboration'
                ? 'bg-white text-black'
                : 'bg-[#0c0c0c] border border-gray-800 hover:bg-[#1f1f1f]'
            }`}
          >
            Collaboration
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'flow' && (
          <div className="bg-[#171717] rounded-lg p-6 border border-gray-800">
            <h2 className="text-xl font-bold mb-4">Creation Flow</h2>
            <p className="text-gray-400 mb-6">
              Visual representation of how prompts evolved into the final design
            </p>
            <div className="h-[700px]">
              <FlowVisualization
                nodes={flowTree.nodes}
                edges={flowTree.edges}
                participants={rawData.participants}
                finalSpec={reportData.finalSpec}
              />
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            <div className="bg-[#171717] rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4">Prompt Analysis Timeline</h2>
              <p className="text-gray-400 mb-6">
                How the AI analyzed and resolved prompts throughout the session
              </p>
              
              {flowTree.nodes
                .filter((n: any) => n.type === 'analysis')
                .map((node: any, idx: number) => (
                  <div key={node.id} className="mb-6 pb-6 border-b border-gray-800 last:border-b-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-mono text-gray-500">
                        Analysis {idx + 1}
                      </span>
                      <span className="text-xs text-gray-600">
                        {new Date(node.timestamp).toLocaleString()}
                      </span>
                    </div>

                    {/* Additive groups */}
                    {node.data.additive && node.data.additive.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-green-500 mb-2">
                          ✓ Additive Prompts ({node.data.additive.length})
                        </h4>
                        {node.data.additive.map((group: any, gIdx: number) => (
                          <div key={gIdx} className="bg-green-600/10 border border-green-600/30 rounded p-3 mb-2">
                            <p className="text-sm text-gray-300">{group.explanation}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {group.promptIds.length} prompt{group.promptIds.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Conflicts */}
                    {node.data.conflicts && node.data.conflicts.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-red-500 mb-2">
                          ⚠ Conflicts ({node.data.conflicts.length})
                        </h4>
                        {node.data.conflicts.map((conflict: any, cIdx: number) => (
                          <div key={cIdx} className="bg-red-600/10 border border-red-600/30 rounded p-3 mb-2">
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-xs font-semibold text-red-400 uppercase">
                                {conflict.type}
                              </span>
                              <span className="text-xs text-gray-500">
                                {Math.round(conflict.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-sm text-gray-300 mb-2">{conflict.reasoning}</p>
                            <p className="text-xs text-gray-500">
                              Winner: {conflict.winner.slice(0, 8)}...
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'scorecard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {scorecards.map((scorecard) => (
              <div
                key={scorecard.participantId}
                className="bg-[#171717] rounded-lg p-6 border-2"
                style={{ borderColor: scorecard.color }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-12 h-12 rounded-full"
                    style={{ backgroundColor: scorecard.color }}
                  />
                  <div>
                    <h3 className="text-xl font-bold">{scorecard.displayName}</h3>
                    <p className="text-sm text-gray-400">Player Stats</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-400">Acceptance Rate</span>
                      <span className="text-sm font-semibold">
                        {scorecard.acceptanceRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-[#0c0c0c] rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${scorecard.acceptanceRate}%`,
                          backgroundColor: scorecard.color,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0c0c0c] rounded p-3">
                      <div className="text-2xl font-bold">{scorecard.totalPrompts}</div>
                      <div className="text-xs text-gray-400">Total Prompts</div>
                    </div>
                    <div className="bg-[#0c0c0c] rounded p-3">
                      <div className="text-2xl font-bold">{scorecard.acceptedPrompts}</div>
                      <div className="text-xs text-gray-400">Accepted</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0c0c0c] rounded p-3">
                      <div className="text-2xl font-bold text-green-500">
                        {scorecard.additivePrompts}
                      </div>
                      <div className="text-xs text-gray-400">Additive</div>
                    </div>
                    <div className="bg-[#0c0c0c] rounded p-3">
                      <div className="text-2xl font-bold text-red-500">
                        {scorecard.conflictedPrompts}
                      </div>
                      <div className="text-xs text-gray-400">Conflicted</div>
                    </div>
                  </div>

                  {scorecard.conflictedPrompts > 0 && (
                    <div className="bg-[#0c0c0c] rounded p-3">
                      <div className="text-2xl font-bold text-yellow-500">
                        {scorecard.wonConflicts}
                      </div>
                      <div className="text-xs text-gray-400">
                        Conflicts Won ({scorecard.conflictedPrompts > 0 
                          ? ((scorecard.wonConflicts / scorecard.conflictedPrompts) * 100).toFixed(0)
                          : 0}%)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'collaboration' && (
          <div className="bg-[#171717] rounded-lg p-6 border border-gray-800">
            <h2 className="text-xl font-bold mb-4">Collaboration Rating</h2>
            
            {/* Overall score */}
            <div className="mb-8">
              <div className="flex items-end gap-4 mb-4">
                <div className="text-6xl font-bold">{collaboration.score}</div>
                <div className="text-gray-400 mb-2">/100</div>
              </div>
              <div className="w-full bg-[#0c0c0c] rounded-full h-4 mb-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    collaboration.score >= 80
                      ? 'bg-green-500'
                      : collaboration.score >= 60
                      ? 'bg-yellow-500'
                      : collaboration.score >= 40
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${collaboration.score}%` }}
                />
              </div>
              <p className="text-gray-300">{collaboration.explanation}</p>
            </div>

            {/* Detailed metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#0c0c0c] rounded-lg p-4">
                <div className="text-3xl font-bold text-purple-500 mb-2">
                  {collaboration.crossPollinationScore.toFixed(0)}%
                </div>
                <div className="text-sm font-semibold mb-1">Cross-Pollination</div>
                <div className="text-xs text-gray-400">
                  How often players built on each other's ideas
                </div>
              </div>

              <div className="bg-[#0c0c0c] rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-500 mb-2">
                  {collaboration.conflictResolutionRate.toFixed(0)}%
                </div>
                <div className="text-sm font-semibold mb-1">Conflict Resolution</div>
                <div className="text-xs text-gray-400">
                  Smoothness of resolving conflicts
                </div>
              </div>

              <div className="bg-[#0c0c0c] rounded-lg p-4">
                <div className="text-3xl font-bold text-green-500 mb-2">
                  {collaboration.contributionBalance.toFixed(0)}%
                </div>
                <div className="text-sm font-semibold mb-1">Contribution Balance</div>
                <div className="text-xs text-gray-400">
                  How evenly work was distributed
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

