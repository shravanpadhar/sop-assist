"use client";

import { MicIcon, StopIcon } from "./icons";

export type MicState = "idle" | "listening" | "processing";

export function Waveform({ wave }: { wave: number[] }) {
  const bars = wave.length ? wave : [0];
  return (
    <div className="flex h-8 flex-1 items-center gap-0.5" aria-hidden="true">
      {bars.map((v, i) => (
        <span key={i} className="w-1 rounded bg-teal" style={{ height: `${Math.max(8, Math.min(100, v * 160))}%` }} />
      ))}
    </div>
  );
}

export function MicButton({ state, onClick, disabled }: { state: MicState; onClick: () => void; disabled?: boolean }) {
  const label = state === "idle" ? "Start voice question" : state === "listening" ? "Stop recording and send" : "Transcribing";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === "processing"}
      aria-label={label}
      aria-pressed={state === "listening"}
      title={label}
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow transition focus-visible:outline-offset-4 disabled:opacity-60 ${state === "listening" ? "bg-red-600 hover:bg-red-700" : "bg-teal hover:bg-teal-700"}`}
    >
      {state === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />}
      {state === "processing" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" /> : state === "listening" ? <StopIcon className="relative h-5 w-5" /> : <MicIcon className="h-6 w-6" />}
    </button>
  );
}
