export type FileKind = "pdf" | "docx" | "xlsx" | "xls" | "csv" | "md" | "txt" | "image";

const BY_EXT: Record<string, { kind: FileKind; mimes: string[] }> = {
  pdf: { kind: "pdf", mimes: ["application/pdf"] },
  docx: { kind: "docx", mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  xlsx: { kind: "xlsx", mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  xls: { kind: "xls", mimes: ["application/vnd.ms-excel"] },
  csv: { kind: "csv", mimes: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"] },
  md: { kind: "md", mimes: ["text/markdown", "text/x-markdown", "text/plain"] },
  txt: { kind: "txt", mimes: ["text/plain"] },
  png: { kind: "image", mimes: ["image/png"] },
  jpg: { kind: "image", mimes: ["image/jpeg"] },
  jpeg: { kind: "image", mimes: ["image/jpeg"] },
  webp: { kind: "image", mimes: ["image/webp"] },
};

export const ACCEPT_EXTENSIONS = Object.keys(BY_EXT);
export const ACCEPT_LABEL = "PDF, DOCX, XLSX, XLS, CSV, MD, TXT (scans: PNG, JPG)";
export const ALL_ALLOWED_MIMES = Array.from(new Set(Object.values(BY_EXT).flatMap((v) => v.mimes)));

export function extOf(filename: string) {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function kindOf(filename: string): FileKind | null {
  return BY_EXT[extOf(filename)]?.kind ?? null;
}

/** Strip path parts and anything that is not a safe filename character. */
export function sanitizeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 120);
}

/** Returns a friendly error message, or null if acceptable. mime may be empty (browsers often omit it). */
export function validateUpload(filename: string, size: number, mime: string, maxMb: number): string | null {
  const ext = extOf(filename);
  const entry = BY_EXT[ext];
  if (!entry) {
    if (ext === "doc") return "Legacy .doc files are not supported. Please save the file as DOCX and upload again.";
    if (ext === "ppt" || ext === "pptx") return "PowerPoint files are not supported. Export to PDF and upload that instead.";
    return `This file type is not supported. Please upload one of: ${ACCEPT_LABEL}.`;
  }
  if (size <= 0) return "The file is empty.";
  if (size > maxMb * 1024 * 1024) return `The file is too large. The limit is ${maxMb} MB.`;
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m && m !== "application/octet-stream" && !entry.mimes.includes(m)) {
    return `The file type (${m}) does not match its extension .${ext}.`;
  }
  return null;
}

/** Check magic bytes so a renamed file cannot masquerade as another type. */
export function sniffMatches(kind: FileKind, buf: Uint8Array): boolean {
  const starts = (...b: number[]) => b.every((v, i) => buf[i] === v);
  switch (kind) {
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case "docx":
    case "xlsx":
      return starts(0x50, 0x4b); // PK
    case "xls":
      return starts(0xd0, 0xcf, 0x11, 0xe0) || starts(0x50, 0x4b) || looksLikeText(buf);
    case "image":
      return starts(0x89, 0x50, 0x4e, 0x47) || starts(0xff, 0xd8, 0xff) || (starts(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57);
    default:
      return looksLikeText(buf);
  }
}

function looksLikeText(buf: Uint8Array) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

export function mimeForKind(kind: FileKind, filename: string) {
  const e = BY_EXT[extOf(filename)];
  return e?.mimes[0] ?? "application/octet-stream";
}
