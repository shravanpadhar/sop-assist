import { STEP_LINE } from "@/lib/ingestion/chunker";
import type { StoredChunk } from "./bm25";

export interface Citation {
  section: string;
  page: string;
  step: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();

/** Find the stored chunk that best matches a model-provided citation (section, page, step). */
export function findCitedChunk(chunks: StoredChunk[], c: Citation): StoredChunk | null {
  if (!chunks.length) return null;
  const section = norm(c.section || "");
  const page = norm(c.page || "").replace(/^page\s*/, "");
  const stepNo = /\d+/.exec(c.step || "")?.[0];
  let best: { chunk: StoredChunk; score: number } | null = null;
  for (const ch of chunks) {
    let score = 0;
    const path = norm(ch.sectionPath ?? "");
    if (section && path) {
      if (path === section) score += 5;
      else if (path.includes(section) || section.includes(path)) score += 3;
      else if (section.split(" > ").some((p) => p && path.includes(p))) score += 1;
    }
    if (section && norm(ch.text).includes(section)) score += 1;
    if (page && ch.page && norm(ch.page).replace(/^page\s*/, "") === page) score += 2;
    if (stepNo) {
      const has = ch.text.split("\n").some((l) => STEP_LINE.exec(l)?.[1] === stepNo);
      if (has) score += 3;
    }
    if (score > 0 && (!best || score > best.score)) best = { chunk: ch, score };
  }
  return best?.chunk ?? null;
}
