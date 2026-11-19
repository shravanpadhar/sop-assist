"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

export interface CitationRef {
  section: string;
  page: string;
  step: string;
}

interface Passage {
  section: string | null;
  page: string | null;
  text: string;
}

export function SourcePanel({ documentId, filename, citation, onClose }: { documentId: string; filename: string; citation: CitationRef | null; onClose: () => void }) {
  const [passage, setPassage] = useState<Passage | null | undefined>(undefined);

  useEffect(() => {
    if (!citation) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassage(undefined);
    const q = new URLSearchParams({ section: citation.section, page: citation.page, step: citation.step });
    fetch(`/api/documents/${documentId}/source?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setPassage(d?.passage ?? null))
      .catch(() => !cancelled && setPassage(null));
    return () => {
      cancelled = true;
    };
  }, [citation, documentId]);

  return (
    <aside aria-label="Source passage" className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy">Source</h2>
        <button onClick={onClose} aria-label="Close source panel" className="rounded p-1 hover:bg-slate-100">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {!citation && <p className="text-muted">Select a citation under an answer to see the passage from the document.</p>}
        {citation && (
          <>
            <p className="font-medium text-ink">{filename}</p>
            <p className="mt-1 text-xs text-muted">
              {[citation.section && `Section: ${citation.section}`, citation.page && `Page: ${citation.page}`, citation.step && `Step: ${citation.step}`].filter(Boolean).join("  |  ") || "No location given"}
            </p>
            <div className="mt-3 rounded-md border-l-4 border-gold bg-surface p-3">
              {passage === undefined && <div className="h-16 animate-pulse rounded bg-slate-200" aria-busy="true" />}
              {passage === null && <p className="text-muted">The exact passage could not be located. Check the section above in the original document.</p>}
              {passage && (
                <>
                  {(passage.section || passage.page) && <p className="mb-2 text-xs text-muted">{[passage.section, passage.page && `page ${passage.page}`].filter(Boolean).join(", ")}</p>}
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{passage.text}</pre>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
