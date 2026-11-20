"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { validateUpload } from "@/lib/ingestion/files";

export type Stage = "idle" | "uploading" | "reading" | "understanding" | "ready" | "failed";

export function notifyDocsChanged() {
  window.dispatchEvent(new Event("docs:changed"));
}

/** Drives the upload -> read -> understand flow and exposes the current stage for the stepper. */
export function useUploader(onDone: (documentId: string) => void) {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPoll, []);

  const reset = useCallback(() => {
    stopPoll();
    setStage("idle");
    setError("");
    setFileName("");
  }, []);

  const start = useCallback(
    async (file: File) => {
      setError("");
      setFileName(file.name);
      try {
        const cfgRes = await fetch("/api/documents/upload-token");
        if (!cfgRes.ok) throw new Error("Please sign in again.");
        const cfg = (await cfgRes.json()) as { mode: "blob" | "blob-oidc" | "local" | "disabled"; prefix: string; maxBytes: number };
        const bad = validateUpload(file.name, file.size, file.type, Math.floor(cfg.maxBytes / 1024 / 1024));
        if (bad) throw new Error(bad);
        if (cfg.mode === "disabled") throw new Error("Uploads are not configured on this server.");

        setStage("uploading");
        let url: string;
        if (cfg.mode === "blob" || cfg.mode === "blob-oidc") {
          const safe = file.name.replace(/[^\p{L}\p{N}._ -]+/gu, "_");
          const path = `${cfg.prefix}${Date.now().toString(36)}-${safe}`; // unique so re-uploads never collide
          const opts = { access: "private" as const, handleUploadUrl: "/api/documents/upload-token", multipart: file.size > 4_000_000 };
          const res = cfg.mode === "blob" ? await upload(path, file, opts) : await uploadPresigned(path, file, opts);
          url = res.url;
        } else {
          const res = await fetch(`/api/documents/dev-upload?name=${encodeURIComponent(file.name)}`, { method: "PUT", headers: { "x-file-type": file.type }, body: file });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Upload failed.");
          url = data.url;
        }

        setStage("reading");
        // Ingestion runs inside the POST below; poll the list so the stepper follows the saved status.
        poll.current = setInterval(async () => {
          try {
            const r = await fetch("/api/documents");
            const list = (await r.json()).documents as { filename: string; status: string }[];
            const mine = list.find((d) => d.filename === file.name && (d.status === "parsing" || d.status === "summarizing"));
            if (mine?.status === "summarizing") setStage("understanding");
          } catch {
            /* ignore */
          }
        }, 2000);
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, filename: file.name, size: file.size, mimeType: file.type }),
        });
        stopPoll();
        const data = await res.json().catch(() => ({}));
        notifyDocsChanged();
        if (!res.ok) throw new Error(data.error ?? "Could not process this document.");
        setStage("ready");
        setTimeout(() => onDone(data.id), 400);
      } catch (e) {
        stopPoll();
        setStage("failed");
        setError(e instanceof Error ? e.message : "Upload failed.");
        notifyDocsChanged();
      }
    },
    [onDone],
  );

  return { stage, error, fileName, start, reset, busy: stage === "uploading" || stage === "reading" || stage === "understanding" };
}
