import type { Stage } from "@/lib/ui/useUploader";

const STEPS = ["Uploading", "Reading", "Understanding", "Ready"] as const;
const INDEX: Record<Stage, number> = { idle: -1, uploading: 0, reading: 1, understanding: 2, ready: 3, failed: -1 };

export function Stepper({ stage, failedAt }: { stage: Stage; failedAt?: number }) {
  const current = stage === "failed" ? (failedAt ?? 0) : INDEX[stage];
  return (
    <ol className="flex w-full items-center gap-2" aria-label="Processing progress">
      {STEPS.map((label, i) => {
        const done = i < current || stage === "ready";
        const active = i === current && stage !== "ready" && stage !== "failed";
        const failed = stage === "failed" && i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                failed ? "bg-red-600 text-white" : done ? "bg-teal text-white" : active ? "animate-pulse bg-navy text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {failed ? "!" : done ? "✓" : i + 1}
            </span>
            <span className={`text-xs ${active || done ? "font-medium text-navy" : "text-muted"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-teal" : "bg-slate-300"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
