'use client';

interface ControlsProps {
  roomId: string;
  participantId: string;
  finishStatus: 'none' | 'pending' | 'approved' | 'you_requested' | 'other_requested';
  onFinishRequest: () => void;
  onFinishApprove: () => void;
  onFinishReject: () => void;
}

export default function Controls({ 
  roomId, 
  participantId,
  finishStatus,
  onFinishRequest,
  onFinishApprove,
  onFinishReject,
}: ControlsProps) {
  const handleDownload = async () => {
    const res = await fetch(`/api/rooms/${roomId}/zip`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dream-sandbox-${roomId.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#171717] rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold">Controls</h2>
      
      <button
        onClick={handleDownload}
        className="w-full px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200"
      >
        Download ZIP
      </button>

      {/* Finish button */}
      {finishStatus === 'none' && (
        <button
          onClick={onFinishRequest}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          Finish
        </button>
      )}

      {finishStatus === 'you_requested' && (
        <div className="w-full px-4 py-2 bg-yellow-600/20 border border-yellow-600 rounded-lg text-center">
          <div className="text-sm text-yellow-500 font-medium">
            Finish Requested
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Waiting for approval...
          </div>
        </div>
      )}

      {finishStatus === 'other_requested' && (
        <div className="space-y-2">
          <div className="text-sm text-yellow-500 font-medium text-center">
            Other player wants to finish!
          </div>
          <div className="flex gap-2">
            <button
              onClick={onFinishApprove}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm"
            >
              Approve
            </button>
            <button
              onClick={onFinishReject}
              className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

