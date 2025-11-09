"use client";

import { useMemo } from "react";

type FlowNode = {
  id: string;
  type: "prompt_batch" | "analysis" | "design_spec";
  timestamp: string;
  participantIds: string[];
  data: any;
};

type FlowEdge = {
  source: string;
  target: string;
  value: number;
  playerAPercent: number;
  playerBPercent: number;
};

interface FlowVisualizationProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  participants: Array<{ id: string; name: string; color: string }>;
  finalSpec?: any; // The final design spec to show what was implemented
}

export default function FlowVisualization({
  nodes,
  edges,
  participants,
  finalSpec,
}: FlowVisualizationProps) {
  // Filter out design_spec nodes - we'll show the implementation summary separately
  const filteredNodes = nodes.filter((n) => n.type !== "design_spec");
  const filteredEdges = edges.filter(
    (e) => !e.target.startsWith("spec-") && !e.source.startsWith("spec-")
  );

  const { positionedNodes, positionedEdges } = useMemo(() => {
    // Simple layered layout
    const layers = new Map<string, number>();
    const nodeHeight = 100;
    const nodeWidth = 260;
    const horizontalSpacing = 200;
    const verticalSpacing = 140;

    // Assign layers based on node type (only 2 layers now)
    filteredNodes.forEach((node) => {
      if (node.type === "prompt_batch") layers.set(node.id, 0);
      else if (node.type === "analysis") layers.set(node.id, 1);
    });

    // Count nodes per layer
    const layerCounts = new Map<number, number>();
    layers.forEach((layer) => {
      layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
    });

    // Position nodes
    const layerIndices = new Map<number, number>();
    const positioned = filteredNodes.map((node) => {
      const layer = layers.get(node.id) || 0;
      const indexInLayer = layerIndices.get(layer) || 0;
      layerIndices.set(layer, indexInLayer + 1);

      return {
        ...node,
        x: layer * (nodeWidth + horizontalSpacing) + 60,
        y: indexInLayer * (nodeHeight + verticalSpacing) + 60,
        width: nodeWidth,
        height: nodeHeight,
      };
    });

    // Position edges
    const posEdges = filteredEdges
      .map((edge) => {
        const sourceNode = positioned.find((n) => n.id === edge.source);
        const targetNode = positioned.find((n) => n.id === edge.target);

        if (!sourceNode || !targetNode) return null;

        return {
          ...edge,
          x1: sourceNode.x + sourceNode.width,
          y1: sourceNode.y + sourceNode.height / 2,
          x2: targetNode.x,
          y2: targetNode.y + targetNode.height / 2,
        };
      })
      .filter(Boolean);

    return { positionedNodes: positioned, positionedEdges: posEdges };
  }, [filteredNodes, filteredEdges]);

  const getNodeColor = (node: FlowNode) => {
    if (node.type === "prompt_batch") return "#2a2a2a";
    if (node.type === "analysis") return "#1f1f1f";
    if (node.type === "design_spec") return "#171717";
    return "#0c0c0c";
  };

  const getEdgeColor = (edge: any) => {
    const playerA = participants[0];
    const playerB = participants[1];

    if (!playerB) return playerA?.color || "#666";

    const percentA = edge.playerAPercent;
    const percentB = edge.playerBPercent;

    // If mostly one player, use their color
    if (percentA > 80) return playerA?.color || "#ef4444";
    if (percentB > 80) return playerB?.color || "#3b82f6";

    // Blend colors for collaboration
    return blendColors(
      playerA?.color || "#ef4444",
      playerB?.color || "#3b82f6",
      percentA / 100
    );
  };

  const getEdgeWidth = (value: number) => {
    return Math.max(2, Math.min(20, value * 3));
  };

  const totalWidth = Math.max(
    ...positionedNodes.map((n) => n.x + n.width),
    900
  );
  const totalHeight = Math.max(
    ...positionedNodes.map((n) => n.y + n.height),
    600
  );

  return (
    <div className="flex gap-6 h-full">
      {/* Flow chart */}
      <div className="flex-1 overflow-auto bg-[#0c0c0c] rounded-lg border border-gray-800">
        <svg
          width={totalWidth + 120}
          height={totalHeight + 120}
          className="w-full h-full min-w-max"
          viewBox={`0 0 ${totalWidth + 120} ${totalHeight + 120}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Draw edges first (behind nodes) */}
          {positionedEdges.map((edge: any, idx) => {
            const color = getEdgeColor(edge);
            const width = getEdgeWidth(edge.value);

            // Curved path
            const midX = (edge.x1 + edge.x2) / 2;
            const path = `M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`;

            return (
              <g key={idx}>
                <path
                  d={path}
                  stroke={color}
                  strokeWidth={width}
                  fill="none"
                  opacity={0.6}
                />
                {/* Edge label showing percentages */}
                {participants.length > 1 && (
                  <text
                    x={midX}
                    y={(edge.y1 + edge.y2) / 2 - 10}
                    fill="#888"
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {Math.round(edge.playerAPercent)}% /{" "}
                    {Math.round(edge.playerBPercent)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Draw nodes */}
          {positionedNodes.map((node) => {
            const bgColor = getNodeColor(node);
            const participant =
              node.participantIds.length === 1
                ? participants.find((p) => p.id === node.participantIds[0])
                : null;
            const borderColor =
              participant?.color ||
              (node.participantIds.length === 1 ? "#444" : "#9333ea");

            return (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth={2}
                  rx={8}
                />
                <text
                  x={node.x + node.width / 2}
                  y={node.y + 30}
                  fill="white"
                  fontSize="14"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {node.type === "prompt_batch" && "Prompt Batch"}
                  {node.type === "analysis" && "Analysis"}
                </text>
                <text
                  x={node.x + node.width / 2}
                  y={node.y + 55}
                  fill="#888"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {node.type === "prompt_batch" &&
                    `${node.data.eventCount} prompt${
                      node.data.eventCount !== 1 ? "s" : ""
                    }`}
                  {node.type === "analysis" &&
                    `${node.data.conflicts?.length || 0} conflict${
                      node.data.conflicts?.length !== 1 ? "s" : ""
                    }`}
                </text>
                <text
                  x={node.x + node.width / 2}
                  y={node.y + 80}
                  fill="#666"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {new Date(node.timestamp).toLocaleTimeString()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Implementation Summary */}
      {finalSpec && (
        <div className="w-96 flex-shrink-0 bg-[#171717] rounded-lg border border-gray-800 p-6 overflow-auto">
          <h3 className="text-lg font-bold mb-4">Final Implementation</h3>

          {/* Layout */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-400 mb-2">
              Layout
            </div>
            <div className="bg-[#0c0c0c] rounded px-3 py-2 text-sm">
              {typeof finalSpec.layout?.kind === "string"
                ? finalSpec.layout.kind
                : typeof finalSpec.layout?.kind === "object"
                ? JSON.stringify(finalSpec.layout.kind)
                : "landing"}
            </div>
          </div>

          {/* Color Palette */}
          {finalSpec.palette && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-gray-400 mb-2">
                Color Palette
              </div>
              <div className="flex gap-2">
                {finalSpec.palette.bg && (
                  <div className="flex-1">
                    <div
                      className="w-full h-10 rounded border border-gray-700"
                      style={{
                        backgroundColor:
                          typeof finalSpec.palette.bg === "string"
                            ? finalSpec.palette.bg
                            : typeof finalSpec.palette.bg === "object" &&
                              finalSpec.palette.bg?.color
                            ? finalSpec.palette.bg.color
                            : "#000",
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-1">Background</div>
                  </div>
                )}
                {finalSpec.palette.fg && (
                  <div className="flex-1">
                    <div
                      className="w-full h-10 rounded border border-gray-700"
                      style={{
                        backgroundColor:
                          typeof finalSpec.palette.fg === "string"
                            ? finalSpec.palette.fg
                            : typeof finalSpec.palette.fg === "object" &&
                              finalSpec.palette.fg?.color
                            ? finalSpec.palette.fg.color
                            : "#fff",
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-1">Foreground</div>
                  </div>
                )}
              </div>
              {finalSpec.palette.accent &&
                finalSpec.palette.accent.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Accents</div>
                    <div className="flex gap-1">
                      {finalSpec.palette.accent.map(
                        (color: any, idx: number) => {
                          const colorValue =
                            typeof color === "string"
                              ? color
                              : typeof color === "object" && color?.color
                              ? color.color
                              : "#000";
                          return (
                            <div
                              key={idx}
                              className="w-8 h-8 rounded border border-gray-700"
                              style={{ backgroundColor: colorValue }}
                            />
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Sections */}
          {finalSpec.layout?.sections &&
            finalSpec.layout.sections.length > 0 && (
              <div className="mb-6">
                <div className="text-sm font-semibold text-gray-400 mb-2">
                  Sections ({finalSpec.layout.sections.length})
                </div>
                <div className="space-y-2">
                  {finalSpec.layout.sections.map(
                    (section: any, idx: number) => (
                      <div key={idx} className="bg-[#0c0c0c] rounded px-3 py-2">
                        <div className="text-sm font-medium">
                          {typeof section.type === "string"
                            ? section.type
                            : JSON.stringify(section.type)}
                        </div>
                        {section.id && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            #
                            {typeof section.id === "string"
                              ? section.id
                              : JSON.stringify(section.id)}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

          {/* Components */}
          {finalSpec.components && finalSpec.components.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-400 mb-2">
                Components ({finalSpec.components.length})
              </div>
              <div className="space-y-2">
                {finalSpec.components.map((component: any, idx: number) => (
                  <div key={idx} className="bg-[#0c0c0c] rounded px-3 py-2">
                    <div className="text-sm font-medium">
                      {typeof component.type === "string"
                        ? component.type
                        : JSON.stringify(component.type)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 font-mono">
                      {typeof component.path === "string"
                        ? component.path
                        : JSON.stringify(component.path)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Theme Variables */}
          {finalSpec.themeVars &&
            Object.keys(finalSpec.themeVars).length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-semibold text-gray-400 mb-2">
                  Theme Variables ({Object.keys(finalSpec.themeVars).length})
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {Object.entries(finalSpec.themeVars).map(([key, value]) => (
                    <div key={key} className="text-xs font-mono text-gray-500">
                      {key}:{" "}
                      <span className="text-gray-400">
                        {typeof value === "string" || typeof value === "number"
                          ? String(value)
                          : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function blendColors(color1: string, color2: string, ratio: number): string {
  const hex1 = color1.replace("#", "");
  const hex2 = color2.replace("#", "");

  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);

  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);

  const r = Math.round(r1 * ratio + r2 * (1 - ratio));
  const g = Math.round(g1 * ratio + g2 * (1 - ratio));
  const b = Math.round(b1 * ratio + b2 * (1 - ratio));

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
