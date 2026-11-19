import MiniSearch from "minisearch";
import { estimateTokens } from "@/lib/ingestion/normalizer";
import { STEP_LINE } from "@/lib/ingestion/chunker";

export interface StoredChunk {
  idx: number;
  text: string;
  sectionPath: string | null;
  page: string | null;
  stepNo: number | null;
  chunkType: string;
  tokenCount: number;
}

/** Question asks for a specific step, e.g. "Step 5 kya hai?", "what is step 3", "स्टेप 5", "चरण 2". */
export function extractStepNumber(q: string): number | null {
  const m = /(?:\bstep|स्टेप|चरण|कदम)\s*(?:no\.?|number|नंबर)?\s*#?\s*(\d{1,3})\b/i.exec(q) ?? /\b(\d{1,3})(?:st|nd|rd|th)\s+step\b/i.exec(q);
  return m ? Number(m[1]) : null;
}

function hasStep(c: StoredChunk, n: number): boolean {
  return c.text.split("\n").some((l) => {
    const m = STEP_LINE.exec(l);
    return m ? Number(m[1]) === n : false;
  });
}

export function searchChunks(chunks: StoredChunk[], query: string, topK: number): StoredChunk[] {
  if (!chunks.length || !query.trim()) return [];
  const ms = new MiniSearch<StoredChunk & { id: number; path: string }>({
    fields: ["text", "path"],
    storeFields: ["idx"],
    searchOptions: { boost: { path: 2 }, prefix: true, fuzzy: 0.15, combineWith: "OR" },
  });
  ms.addAll(chunks.map((c) => ({ ...c, id: c.idx, path: c.sectionPath ?? "" })));
  const hits = ms.search(query).slice(0, topK);
  const byIdx = new Map(chunks.map((c) => [c.idx, c]));
  return hits.map((h) => byIdx.get(h.id as number)!).filter(Boolean);
}

/**
 * Pick chunks for a question: direct step lookup first, then BM25, kept within a token budget.
 * Result is returned in document order so numbered procedures read naturally.
 */
export function selectChunks(chunks: StoredChunk[], query: string, opts: { topK?: number; maxTokens: number; question?: string }): StoredChunk[] {
  const topK = opts.topK ?? 6;
  const chosen: StoredChunk[] = [];
  const add = (c: StoredChunk) => {
    if (!chosen.some((x) => x.idx === c.idx)) chosen.push(c);
  };
  const step = extractStepNumber(opts.question ?? query);
  if (step !== null) {
    // Prefer chunks containing the step, ordered by BM25 relevance to the rest of the question.
    const ranked = searchChunks(chunks, query, chunks.length).filter((c) => hasStep(c, step));
    const direct = ranked.length ? ranked : chunks.filter((c) => hasStep(c, step));
    direct.slice(0, 2).forEach(add);
  }
  for (const c of searchChunks(chunks, query, topK)) add(c);
  if (!chosen.length) chunks.slice(0, 3).forEach(add); // nothing matched (e.g. cross-language): give the opening sections

  const out: StoredChunk[] = [];
  let used = 0;
  for (const c of chosen.slice(0, topK)) {
    if (used + c.tokenCount > opts.maxTokens && out.length) continue;
    out.push(c);
    used += c.tokenCount;
  }
  return out.sort((a, b) => a.idx - b.idx);
}

export function formatChunk(c: StoredChunk): string {
  const meta = [c.sectionPath ? `Section: ${c.sectionPath}` : "", c.page ? `Page: ${c.page}` : ""].filter(Boolean).join(" | ");
  return `[${meta || "Section: (untitled)"}]\n${c.text}`;
}

export function formatChunks(chunks: StoredChunk[]): string {
  return chunks.map(formatChunk).join("\n\n---\n\n");
}

export { estimateTokens };
