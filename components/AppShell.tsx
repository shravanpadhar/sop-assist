"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookIcon, CloseIcon, FileIcon, MenuIcon, TrashIcon, UploadIcon } from "./icons";
import { ToastProvider, useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUploader, notifyDocsChanged } from "@/lib/ui/useUploader";
import { ACCEPT_EXTENSIONS } from "@/lib/ingestion/files";

interface Doc {
  id: string;
  filename: string;
  title: string | null;
  status: "uploaded" | "parsing" | "summarizing" | "ready" | "failed";
}

const STATUS_LABEL: Record<Doc["status"], string> = { uploaded: "Queued", parsing: "Reading", summarizing: "Understanding", ready: "Ready", failed: "Failed" };

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploader = useUploader((id) => {
    router.push(`/documents/${id}`);
    onNavigate();
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/documents");
      if (r.ok) setDocs((await r.json()).documents);
    } catch {
      /* offline: keep old list */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    window.addEventListener("docs:changed", load);
    return () => window.removeEventListener("docs:changed", load);
  }, [load]);

  const processing = docs?.some((d) => ["uploaded", "parsing", "summarizing"].includes(d.status));
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [processing, load]);

  async function remove(d: Doc) {
    setToDelete(null);
    const r = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (!r.ok) return toast("Could not delete the document.", "error");
    toast("Document deleted.");
    notifyDocsChanged();
    if (pathname.includes(d.id)) router.push("/dashboard");
  }

  return (
    <nav aria-label="Documents" className="flex h-full flex-col bg-white">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <input ref={input} type="file" className="sr-only" accept={ACCEPT_EXTENSIONS.map((e) => `.${e}`).join(",")} aria-label="Upload SOP file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploader.start(f); e.target.value = ""; }} />
        <button onClick={() => input.current?.click()} disabled={uploader.busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
          <UploadIcon className="h-4 w-4" /> {uploader.busy ? `${uploader.stage}...` : "Upload SOP"}
        </button>
        {uploader.error && <p role="alert" className="text-xs text-red-700">{uploader.error}</p>}
        <Link href="/dashboard" onClick={onNavigate} className="block text-center text-xs text-teal-700 underline">
          Upload guide and tips
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Your documents</p>
        {docs === null && <div className="space-y-2 p-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>}
        {docs?.length === 0 && <p className="p-3 text-sm text-muted">No documents yet. Upload your first SOP to start asking questions.</p>}
        <ul>
          {docs?.map((d) => {
            const active = pathname === `/documents/${d.id}`;
            return (
              <li key={d.id} className={`group flex items-center rounded-md ${active ? "bg-navy/10" : "hover:bg-slate-100"}`}>
                <Link href={`/documents/${d.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2" aria-current={active ? "page" : undefined}>
                  <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{d.title || d.filename}</span>
                    <span className={`text-xs ${d.status === "failed" ? "text-red-700" : d.status === "ready" ? "text-teal-700" : "text-muted"}`}>{STATUS_LABEL[d.status]}</span>
                  </span>
                </Link>
                <button onClick={() => setToDelete(d)} aria-label={`Delete ${d.filename}`} className="mr-1 rounded p-1.5 text-muted opacity-60 hover:bg-red-50 hover:text-red-700 hover:opacity-100 focus:opacity-100 group-hover:opacity-100">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <ConfirmDialog open={!!toDelete} title="Delete this document?" body={`"${toDelete?.filename ?? ""}" and its conversations will be permanently deleted.`} onConfirm={() => toDelete && remove(toDelete)} onCancel={() => setToDelete(null)} />
    </nav>
  );
}

export function AppShell({ user, appName, companyName, privacyNotice, children }: { user: { name: string; email: string }; appName: string; companyName: string; privacyNotice: string; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col">
        <header className="flex shrink-0 items-center justify-between bg-navy px-3 py-2.5 text-white md:px-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} className="rounded p-1.5 hover:bg-white/10 md:hidden" aria-label="Open documents menu">
              <MenuIcon />
            </button>
            <BookIcon className="hidden text-gold md:block" />
            <Link href="/dashboard" className="font-semibold">
              {appName}
            </Link>
            <span className="hidden text-xs text-slate-300 sm:inline">{companyName}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-[12rem] truncate sm:inline" title={user.email}>
              {user.name}
            </span>
            <button onClick={logout} className="rounded border border-white/40 px-2.5 py-1 text-xs hover:bg-white/10">
              Sign out
            </button>
          </div>
        </header>
        <p className="shrink-0 bg-amber-50 px-4 py-1 text-xs text-amber-900" role="note">
          {privacyNotice}
        </p>
        <div className="relative flex min-h-0 flex-1">
          <aside className="hidden w-72 shrink-0 border-r border-slate-200 md:block">
            <Sidebar onNavigate={() => {}} />
          </aside>
          {open && (
            <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Documents">
              <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
                <button onClick={() => setOpen(false)} className="self-end p-2" aria-label="Close menu">
                  <CloseIcon />
                </button>
                <div className="min-h-0 flex-1">
                  <Sidebar onNavigate={() => setOpen(false)} />
                </div>
              </div>
            </div>
          )}
          <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
