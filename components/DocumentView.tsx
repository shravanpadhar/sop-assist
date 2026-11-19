"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatPanel } from "./ChatPanel";
import { SourcePanel, type CitationRef } from "./SourcePanel";
import { Stepper } from "./Stepper";
import type { SummaryData } from "./SummaryCard";
import { notifyDocsChanged } from "@/lib/ui/useUploader";
import type { Stage } from "@/lib/ui/useUploader";

interface Doc {
  id: string;
  filename: string;
  status: "uploaded" | "parsing" | "summarizing" | "ready" | "failed";
  errorMessage: string | null;
  summary: SummaryData | null;
  starterQuestions: string[];
}

const STAGE: Record<Doc["status"], Stage> = { uploaded: "reading", parsing: "reading", summarizing: "understanding", ready: "ready", failed: "failed" };

export function DocumentView({ id, ttsEngine, hinglishSpeech }: { id: string; ttsEngine: "browser" | "gemini"; hinglishSpeech: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [citation, setCitation] = useState<CitationRef | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/documents/${id}`);
    if (r.status === 404) return setMissing(true);
    if (r.ok) setDoc(await r.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const processing = doc && ["uploaded", "parsing", "summarizing"].includes(doc.status);
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void load().then(notifyDocsChanged), 2500);
    return () => clearInterval(t);
  }, [processing, load]);

  if (missing)
    return (
      <div className="p-8 text-center">
        <p className="text-ink">This document was not found.</p>
        <Link href="/dashboard" className="mt-2 inline-block text-teal-700 underline">
          Back to upload
        </Link>
      </div>
    );
  if (!doc) return <div className="p-6"><div className="h-24 animate-pulse rounded-xl bg-slate-200" aria-busy="true" /></div>;

  if (doc.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="mb-4 truncate font-medium text-navy">{doc.filename}</p>
          <Stepper stage={STAGE[doc.status]} failedAt={doc.status === "failed" ? 1 : undefined} />
          {doc.status === "failed" ? (
            <div role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
              <p>{doc.errorMessage ?? "This document could not be processed."}</p>
              <div className="mt-3 flex gap-2">
                <Link href="/dashboard" className="rounded bg-navy px-3 py-1.5 text-xs text-white">
                  Upload again
                </Link>
                <button
                  className="rounded border border-red-300 px-3 py-1.5 text-xs"
                  onClick={async () => {
                    await fetch(`/api/documents/${id}`, { method: "DELETE" });
                    notifyDocsChanged();
                    router.push("/dashboard");
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Your document is being processed. You can leave this page; progress is saved.</p>
          )}
        </div>
      </div>
    );
  }

  const cite = (c: CitationRef) => {
    setCitation(c);
    setSourceOpen(true);
  };

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <ChatPanel documentId={doc.id} filename={doc.filename} summary={doc.summary} starters={doc.starterQuestions} ttsEngine={ttsEngine} hinglishSpeech={hinglishSpeech} onCite={cite} />
      </div>
      {sourceOpen && (
        <>
          <div className="hidden w-96 shrink-0 lg:block">
            <SourcePanel documentId={doc.id} filename={doc.filename} citation={citation} onClose={() => setSourceOpen(false)} />
          </div>
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Source passage">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSourceOpen(false)} />
            <div className="absolute inset-y-0 right-0 w-[90%] max-w-sm bg-white shadow-xl">
              <SourcePanel documentId={doc.id} filename={doc.filename} citation={citation} onClose={() => setSourceOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
