import type { FileKind } from "./files";

const DEVANAGARI = /[ऀ-ॿ]/g;

/** Rough token estimate (Latin ~4 chars/token, Devanagari and others ~2). */
export function estimateTokens(text: string): number {
  const dev = (text.match(DEVANAGARI) ?? []).length;
  return Math.ceil((text.length - dev) / 4 + dev / 2);
}

export function detectDocLanguage(text: string): "en" | "hi" | "mixed" {
  const dev = (text.match(DEVANAGARI) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = dev + lat;
  if (total === 0) return "en";
  const r = dev / total;
  return r > 0.7 ? "hi" : r > 0.1 ? "mixed" : "en";
}

const NUMBERED_HEADING = /^(\d+(?:\.\d+){0,2})[.)]?\s+(\p{Lu}[\p{L}\p{N} &/,'()\-]{2,70})$/u;

/** True for short title-like lines such as "5. Procedure" or "PURPOSE" (used for PDFs/TXT with no Markdown headings). */
export function looksLikeHeading(line: string): { level: number } | null {
  const l = line.trim();
  if (!l || l.length > 80 || /[.:;,]$/.test(l)) return null;
  const m = NUMBERED_HEADING.exec(l);
  if (m && l.split(/\s+/).length <= 9) return { level: Math.min(m[1].split(".").length, 3) };
  if (/^[A-Z][A-Z &/\-]{3,60}$/.test(l) && /[A-Z]{3}/.test(l)) return { level: 1 };
  return null;
}

/** Clean text and (for unstructured sources) promote heading-like lines to Markdown headings. */
export function normalizeText(raw: string, kind?: FileKind): string {
  let t = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .normalize("NFC");
  const structured = /^#{1,6} /m.test(t.replace(/^## (Page|Sheet)\b.*$/gm, ""));
  if (!structured && (kind === "pdf" || kind === "txt" || kind === "image")) {
    t = t
      .split("\n")
      .map((line) => {
        if (/^#{1,6} /.test(line)) return line;
        const h = looksLikeHeading(line);
        return h ? `${"#".repeat(h.level + 0)} ${line.trim()}` : line;
      })
      .join("\n");
  }
  return t;
}

export interface OutlineItem {
  level: number;
  title: string;
  path: string;
  page?: string;
}

const PAGE_MARK = /^## (?:Page\s+(\d+)|Sheet:\s*(.+))\s*$/;

export function pageMarker(line: string): string | null {
  const m = PAGE_MARK.exec(line);
  if (!m) return null;
  return m[1] ? m[1] : `Sheet: ${m[2].trim()}`;
}

export function buildOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const stack: { level: number; title: string }[] = [];
  let page: string | undefined;
  for (const line of text.split("\n")) {
    const pm = pageMarker(line);
    if (pm) {
      page = pm;
      if (pm.startsWith("Sheet:")) items.push({ level: 1, title: pm, path: pm, page: pm });
      continue;
    }
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, title: m[2] });
    items.push({ level, title: m[2], path: stack.map((s) => s.title).join(" > "), page });
  }
  return items;
}
