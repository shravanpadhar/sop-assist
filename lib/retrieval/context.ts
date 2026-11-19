import { estimateTokens, type OutlineItem } from "@/lib/ingestion/normalizer";
import { formatChunks, selectChunks, type StoredChunk } from "./bm25";

export interface DocForContext {
  filename: string;
  normalizedText: string;
  tokenCount: number;
  summary: Record<string, unknown> | null;
  outline: OutlineItem[];
}

export type RetrievalMode = "full" | "retrieval";

/** Compact text form of the stored summary (used in both modes). */
export function summaryText(doc: DocForContext): string {
  const s = doc.summary ?? {};
  const list = (k: string) => (Array.isArray(s[k]) && (s[k] as string[]).length ? (s[k] as string[]).join("; ") : "");
  const lines = [
    `Title: ${s.title ?? doc.filename}`,
    s.purpose ? `Purpose: ${s.purpose}` : "",
    s.scope ? `Scope: ${s.scope}` : "",
    list("roles") ? `Roles: ${list("roles")}` : "",
    list("procedures") ? `Procedures: ${list("procedures")}` : "",
    list("key_warnings") ? `Key warnings: ${list("key_warnings")}` : "",
    list("forms_and_tools") ? `Forms and tools: ${list("forms_and_tools")}` : "",
    s.revision_info ? `Revision: ${s.revision_info}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function outlineText(outline: OutlineItem[], maxItems = 60): string {
  return outline
    .slice(0, maxItems)
    .map((o) => `${"  ".repeat(Math.max(0, o.level - 1))}- ${o.title}${o.page ? ` (page ${o.page})` : ""}`)
    .join("\n");
}

export function chooseMode(provider: { mode: RetrievalMode }, tokenCount: number, fullMaxTokens: number): RetrievalMode {
  return provider.mode === "retrieval" || tokenCount > fullMaxTokens ? "retrieval" : "full";
}

export interface BuiltContext {
  mode: RetrievalMode;
  summary: string;
  context: string;
  chunkCount: number;
}

/**
 * Mode A: whole document. Mode B: summary, outline and the best chunks for the (rewritten) query within a token budget.
 * `loadChunks` is only called in Mode B.
 */
export async function buildContext(p: {
  mode: RetrievalMode;
  doc: DocForContext;
  query: string;
  question: string;
  loadChunks: () => Promise<StoredChunk[]>;
  maxTokens: number;
}): Promise<BuiltContext> {
  const summary = summaryText(p.doc);
  if (p.mode === "full") {
    return { mode: "full", summary, context: `DOCUMENT: ${p.doc.filename}\n\n${p.doc.normalizedText}`, chunkCount: 0 };
  }
  const outline = outlineText(p.doc.outline);
  const overhead = estimateTokens(summary) + estimateTokens(outline);
  const chunks = await p.loadChunks();
  const picked = selectChunks(chunks, p.query, { maxTokens: Math.max(1000, p.maxTokens - overhead), question: p.question });
  const context = `OUTLINE:\n${outline || "(none)"}\n\nRELEVANT PASSAGES:\n\n${formatChunks(picked)}`;
  return { mode: "retrieval", summary, context, chunkCount: picked.length };
}
