'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface FinishApprovalModalProps {
  roomId: string;
  participantId: string;
  finishRequestId: string;
  requesterName: string;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

export default function FinishApprovalModal({
  roomId,
  participantId,
  finishRequestId,
  requesterName,
  onApprove,
  onReject,
  onClose,
}: FinishApprovalModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    await onApprove();
    // Don't need to setIsProcessing(false) because modal will close
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onReject();
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#171717] rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
        <h2 className="text-xl font-bold mb-4">Finish Request</h2>
        
        <p className="text-gray-300 mb-6">
          <span className="text-white font-semibold">{requesterName}</span> wants to finish this session.
          Do you want to approve and see the final report?
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 bg-[#0c0c0c] border border-gray-800 text-white rounded-lg font-medium hover:bg-[#1f1f1f] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}


