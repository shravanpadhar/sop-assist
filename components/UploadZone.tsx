"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUploader } from "@/lib/ui/useUploader";
import { ACCEPT_EXTENSIONS, ACCEPT_LABEL } from "@/lib/ingestion/files";
import { Stepper } from "./Stepper";
import { UploadIcon } from "./icons";

export function UploadZone({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { stage, error, fileName, start, reset, busy } = useUploader((id) => router.push(`/documents/${id}`));

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) void start(f);
  }

  return (
    <section aria-label="Upload an SOP" className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) pick(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed bg-white p-8 text-center transition ${drag ? "border-teal bg-teal/5" : "border-slate-300"}`}
      >
        <UploadIcon className="mx-auto h-10 w-10 text-navy" />
        <h2 className="mt-3 text-lg font-semibold text-navy">Upload an SOP document</h2>
        <p className="mt-1 text-sm text-muted">Drag and drop a file here, or choose one from your device.</p>
        <p className="mt-1 text-xs text-muted">
          {ACCEPT_LABEL}. Maximum size {maxMb} MB.
        </p>
        <input ref={input} type="file" className="sr-only" accept={ACCEPT_EXTENSIONS.map((e) => `.${e}`).join(",")} onChange={(e) => pick(e.target.files)} aria-label="Choose SOP file" />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            reset();
            input.current?.click();
          }}
          className="mt-4 rounded-md bg-navy px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50"
        >
          Choose file
        </button>
      </div>

      {stage !== "idle" && (
        <div className="mt-5 rounded-xl bg-white p-5 shadow-sm" aria-live="polite">
          <p className="mb-3 truncate text-sm font-medium text-navy">{fileName}</p>
          <Stepper stage={stage} failedAt={stage === "failed" ? 1 : undefined} />
          {stage === "understanding" && <p className="mt-3 text-xs text-muted">Building the summary and starter questions. This can take up to a minute for long documents.</p>}
          {error && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
