"use client";

import { useEffect, useState } from "react";

type CallViewProps = {
  agentSpeaking: boolean;
  userSpeaking: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  liveCaption?: string;
};

export default function CallView({
  agentSpeaking,
  userSpeaking,
  muted,
  onToggleMute,
  onEnd,
  liveCaption,
}: CallViewProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");

  const statusLabel = agentSpeaking
    ? "Agora is speaking"
    : userSpeaking
      ? "Listening"
      : "Thinking";

  return (
    <div className="flex w-full flex-col items-center gap-10">
      {/* Orb */}
      <div
        className="relative flex h-56 w-56 items-center justify-center"
        aria-hidden="true"
      >
        {/* Outer soft halo — pulses while agent talks */}
        <div
          className={[
            "absolute inset-0 rounded-full bg-accent-400/20 blur-2xl transition-all duration-700",
            agentSpeaking ? "scale-110 opacity-100" : "scale-95 opacity-60",
          ].join(" ")}
        />
        {/* Mid ring — user-speaking wave (subtle) */}
        <div
          className={[
            "absolute inset-4 rounded-full border border-accent-400/40 transition-transform duration-300",
            userSpeaking ? "animate-pulse scale-[1.04]" : "scale-100",
          ].join(" ")}
        />
        {/* Core orb */}
        <div
          className={[
            "relative h-36 w-36 rounded-full bg-gradient-to-br from-accent-400 to-accent-500 shadow-lg transition-transform",
            agentSpeaking
              ? "scale-105 animate-[pulse_1.6s_ease-in-out_infinite]"
              : "scale-100",
          ].join(" ")}
        />
      </div>

      {/* Minimal status text */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-sm text-ink-500" aria-live="polite">
          {statusLabel}
        </div>
        <div className="font-mono text-xs text-ink-300 tabular-nums">
          {mins}:{secs}
        </div>
      </div>

      {/* Optional live caption */}
      {liveCaption ? (
        <div className="max-w-md text-center text-sm text-ink-700 min-h-[2.5rem]">
          {liveCaption}
        </div>
      ) : (
        <div className="min-h-[2.5rem]" />
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          className="btn-secondary"
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={muted}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="btn-danger"
          aria-label="End call"
        >
          End call
        </button>
      </div>
    </div>
  );
}
