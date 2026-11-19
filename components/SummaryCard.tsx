"use client";

import { useState } from "react";

export interface SummaryData {
  title?: string;
  purpose?: string;
  scope?: string;
  roles?: string[];
  procedures?: string[];
  key_warnings?: string[];
  forms_and_tools?: string[];
  revision_info?: string;
  warnings?: string[];
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryCard({ summary, filename, starters, onAsk, disabled }: { summary: SummaryData | null; filename: string; starters: string[]; onAsk: (q: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(true);
  const s = summary ?? {};
  return (
    <section aria-label="Document summary" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-navy">{s.title || filename}</h2>
          {s.purpose && <p className="mt-1 text-sm text-ink">{s.purpose}</p>}
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {s.warnings?.map((w, i) => (
        <p key={i} role="note" className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          {w}
        </p>
      ))}
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {s.scope && (
            <div className="sm:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scope</h3>
              <p className="mt-1 text-sm">{s.scope}</p>
            </div>
          )}
          <List title="Roles and responsibilities" items={s.roles} />
          <List title="Procedures" items={s.procedures} />
          <List title="Key warnings" items={s.key_warnings} />
          <List title="Forms and tools" items={s.forms_and_tools} />
          {s.revision_info && (
            <div className="sm:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Revision</h3>
              <p className="mt-1 text-sm">{s.revision_info}</p>
            </div>
          )}
        </div>
      )}
      {starters.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {starters.map((q) => (
              <button key={q} disabled={disabled} onClick={() => onAsk(q)} className="rounded-full border border-teal/50 bg-teal/5 px-3 py-1.5 text-left text-sm text-teal-700 hover:bg-teal/10 disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
