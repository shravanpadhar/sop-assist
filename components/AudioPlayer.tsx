"use client";

import type { SpeakerState } from "@/lib/voice/tts";
import { SPEEDS } from "@/lib/voice/tts";
import { PauseIcon, PlayIcon, ReplayIcon, StopIcon } from "./icons";

export function AudioPlayer({ active, state, rate, onPlay, onPause, onResume, onStop, onRate }: { active: boolean; state: SpeakerState; rate: number; onPlay: () => void; onPause: () => void; onResume: () => void; onStop: () => void; onRate: (r: number) => void }) {
  const speaking = active && state === "speaking";
  const paused = active && state === "paused";
  const btn = "rounded p-1.5 text-navy hover:bg-slate-100";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Audio controls">
      {!active || state === "idle" ? (
        <button onClick={onPlay} className={btn} aria-label={active ? "Replay answer" : "Play answer aloud"} title="Play">
          {active ? <ReplayIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
      ) : (
        <>
          <button onClick={speaking ? onPause : onResume} className={btn} aria-label={speaking ? "Pause" : "Resume"}>
            {speaking ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
          <button onClick={onStop} className={btn} aria-label="Stop">
            <StopIcon className="h-4 w-4" />
          </button>
          <button onClick={onPlay} className={btn} aria-label="Replay from start">
            <ReplayIcon className="h-4 w-4" />
          </button>
        </>
      )}
      {(speaking || paused) && <span className="sr-only" aria-live="polite">{speaking ? "Speaking" : "Paused"}</span>}
      <label className="ml-1 flex items-center gap-1 text-xs text-muted">
        <span className="sr-only">Speech speed</span>
        <select value={rate} onChange={(e) => onRate(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs" aria-label="Speech speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
