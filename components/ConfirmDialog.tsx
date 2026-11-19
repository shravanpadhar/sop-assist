"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({ open, title, body, confirmLabel = "Delete", onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="confirm-title" className="m-auto w-full max-w-sm rounded-xl p-0 shadow-xl backdrop:bg-black/40">
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-semibold text-navy">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800">
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
