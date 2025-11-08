'use client';

interface ControlsProps {
  roomId: string;
  chaos: number;
  setChaos: (v: number) => void;
  isJudgeMode: boolean;
  setIsJudgeMode: (v: boolean) => void;
}

export default function Controls({ roomId, chaos, setChaos, isJudgeMode, setIsJudgeMode }: ControlsProps) {
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
      
      <div className="space-y-2">
        <label className="text-sm text-gray-400">
          Chaos: {chaos.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={chaos}
          onChange={(e) => setChaos(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        onClick={() => setIsJudgeMode(!isJudgeMode)}
        className={`w-full px-4 py-2 rounded-lg font-medium ${
          isJudgeMode
            ? 'bg-yellow-600 text-white'
            : 'bg-[#0c0c0c] border border-gray-800 hover:bg-[#1f1f1f]'
        }`}
      >
        {isJudgeMode ? 'Judge Mode ON' : 'Judge Mode'}
      </button>

      <button
        onClick={handleDownload}
        className="w-full px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200"
      >
        Download ZIP
      </button>
    </div>
  );
}

