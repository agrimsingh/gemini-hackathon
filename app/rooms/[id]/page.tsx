"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { joinRoom } from "./join";
import { usePlannerBuilder } from "@/lib/plannerHook";
import type { Participant } from "@/lib/types";
import PresenceRings from "@/components/PresenceRings";
import PromptEditor from "@/components/PromptEditor";
import PreviewSandbox from "@/components/PreviewSandbox";
import HeatmapOverlay from "@/components/HeatmapOverlay";
import Controls from "@/components/Controls";
import DiffSidebar from "@/components/DiffSidebar";
import ThinkingDisplay from "@/components/ThinkingDisplay";
import FinishApprovalModal from "@/components/FinishApprovalModal";
import FinalReport from "@/components/FinalReport";
import AIStatusTimeline from "@/components/AIStatusTimeline";
import ActivityFeed from "@/components/ActivityFeed";
import { useRoomPresence } from "@/lib/useRoomPresence";
import { requestFinish, approveFinish, rejectFinish, getFinishStatus } from "./finish";

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const displayName = searchParams.get("name") || "Anonymous";

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isJoining, setIsJoining] = useState(true);
  const [finishRequest, setFinishRequest] = useState<any>(null);
  const [showFinalReport, setShowFinalReport] = useState(false);
  const joiningRef = useRef(false);

  usePlannerBuilder({ roomId });

  const currentParticipant = participants.find((p) => p.id === participantId);
  const { presenceById } = useRoomPresence(
    roomId,
    participantId,
    displayName,
    currentParticipant?.color || '#666'
  );

  useEffect(() => {
    let mounted = true;

    // Prevent multiple simultaneous joins
    if (joiningRef.current) return;
    joiningRef.current = true;

    async function init() {
      try {
        // Check if we already have a participant ID for this room (in this tab/window)
        const storageKey = `participant_${roomId}`;
        const storedParticipantId =
          typeof window !== "undefined"
            ? sessionStorage.getItem(storageKey)
            : null;

        let pid: string;
        let color: string;

        if (storedParticipantId) {
          // Verify participant still exists
          const { data: existing } = await supabase
            .from("participants")
            .select("id, color")
            .eq("id", storedParticipantId)
            .eq("room_id", roomId)
            .single();

          if (existing) {
            pid = existing.id;
            color = existing.color;
          } else {
            // Participant doesn't exist, create new one
            const result = await joinRoom(roomId, displayName);
            pid = result.participantId;
            color = result.color;
            if (typeof window !== "undefined") {
              sessionStorage.setItem(storageKey, pid);
            }
          }
        } else {
          // No stored participant, create new one
          const result = await joinRoom(roomId, displayName);
          pid = result.participantId;
          color = result.color;
          if (typeof window !== "undefined") {
            sessionStorage.setItem(storageKey, pid);
          }
        }

        if (!mounted) {
          joiningRef.current = false;
          return;
        }
        setParticipantId(pid);

        // Subscribe to participants changes
        const participantsChannel = supabase
          .channel(`room:${roomId}:participants`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "participants",
              filter: `room_id=eq.${roomId}`,
            },
            async () => {
              const { data } = await supabase
                .from("participants")
                .select("*")
                .eq("room_id", roomId);
              if (data && mounted) {
                // Deduplicate by display_name (keep most recent)
                const uniqueParticipants = Array.from(
                  new Map(data.map((p) => [p.display_name, p])).values()
                ) as Participant[];
                setParticipants(uniqueParticipants);
              }
            }
          )
          .subscribe();

        // Initial load
        const { data } = await supabase
          .from("participants")
          .select("*")
          .eq("room_id", roomId);
        if (data && mounted) {
          // Deduplicate by display_name (keep most recent)
          const uniqueParticipants = Array.from(
            new Map(data.map((p) => [p.display_name, p])).values()
          ) as Participant[];
          setParticipants(uniqueParticipants);
        }

        setIsJoining(false);
        joiningRef.current = false;

        return () => {
          participantsChannel.unsubscribe();
        };
      } catch (error) {
        console.error("Failed to join room:", error);
        joiningRef.current = false;
      }
    }

    init();

    return () => {
      mounted = false;
      joiningRef.current = false;
    };
  }, [roomId]); // Only depend on roomId, not displayName

  // Subscribe to finish requests
  useEffect(() => {
    if (!participantId) return;

    let mounted = true;

    // Initial fetch
    getFinishStatus(roomId).then((data) => {
      if (mounted && data) {
        setFinishRequest(data);
        if (data.status === 'approved') {
          setShowFinalReport(true);
        }
      }
    });

    // Subscribe to changes
    const finishChannel = supabase
      .channel(`room:${roomId}:finishes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_finishes',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (mounted) {
            const newData = payload.new as any;
            setFinishRequest(newData);
            
            if (newData.status === 'approved') {
              setShowFinalReport(true);
            } else if (newData.status === 'rejected') {
              setFinishRequest(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      finishChannel.unsubscribe();
    };
  }, [roomId, participantId]);

  if (isJoining || !participantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Joining room...</div>
      </div>
    );
  }

  // Determine finish status for UI
  const getFinishStatusForUI = (): 'none' | 'pending' | 'approved' | 'you_requested' | 'other_requested' => {
    if (!finishRequest) return 'none';
    if (finishRequest.status === 'approved') return 'approved';
    if (finishRequest.requester_id === participantId) return 'you_requested';
    return 'other_requested';
  };

  const handleFinishRequest = async () => {
    await requestFinish(roomId, participantId);
  };

  const handleFinishApprove = async () => {
    await approveFinish(roomId, participantId);
  };

  const handleFinishReject = async () => {
    if (finishRequest) {
      await rejectFinish(roomId, finishRequest.id);
    }
  };

  // Show final report if approved
  if (showFinalReport && finishRequest?.final_report_json) {
    return (
      <FinalReport
        reportData={finishRequest.final_report_json}
        onClose={() => setShowFinalReport(false)}
      />
    );
  }

  // Show approval modal if other player requested finish
  const showApprovalModal = finishRequest && 
    finishRequest.status === 'pending' && 
    finishRequest.requester_id !== participantId;

  const requesterName = showApprovalModal
    ? participants.find((p) => p.id === finishRequest.requester_id)?.display_name || 'Other player'
    : '';

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white flex flex-col">
      <header className="border-b border-gray-800 p-4 flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-xl font-bold">Vibe de Deux</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-400">Room ID:</span>
            <code className="text-xs bg-[#171717] px-2 py-1 rounded border border-gray-800 font-mono">
              {roomId}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(roomId);
              }}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-[#171717]"
              title="Copy room ID"
            >
              📋
            </button>
          </div>
        </div>
        <PresenceRings 
          participants={participants} 
          currentId={participantId}
          presenceById={presenceById}
        />
      </header>

      <div className="flex-1 grid grid-cols-[400px_1fr_300px] gap-4 p-4">
        <div className="space-y-4">
          <PromptEditor 
            roomId={roomId} 
            participantId={participantId}
            displayName={displayName}
            color={currentParticipant?.color || '#666'}
          />
          <ThinkingDisplay roomId={roomId} />
          <AIStatusTimeline roomId={roomId} />
          <ActivityFeed roomId={roomId} participants={participants} />
          <DiffSidebar roomId={roomId} />
        </div>

        <div className="relative">
          <PreviewSandbox roomId={roomId} />
          <HeatmapOverlay participants={participants} roomId={roomId} />
        </div>

        <div>
          <Controls
            roomId={roomId}
            participantId={participantId}
            finishStatus={getFinishStatusForUI()}
            onFinishRequest={handleFinishRequest}
            onFinishApprove={handleFinishApprove}
            onFinishReject={handleFinishReject}
          />
        </div>
      </div>

      {/* Finish approval modal */}
      {showApprovalModal && (
        <FinishApprovalModal
          roomId={roomId}
          participantId={participantId}
          finishRequestId={finishRequest.id}
          requesterName={requesterName}
          onApprove={handleFinishApprove}
          onReject={handleFinishReject}
          onClose={() => {}}
        />
      )}
    </div>
  );
}
