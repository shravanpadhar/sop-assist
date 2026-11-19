import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";
import { findCitedChunk } from "@/lib/retrieval/citation";

export const dynamic = "force-dynamic";

/** Returns the passage that a citation points to: GET /api/documents/[id]/source?section=&page=&step= */
export const GET = route<{ id: string }>({ name: "source" }, async (req, { user, params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fail("Not found.", 404);
  const [d] = await db().select({ id: documents.id, filename: documents.filename }).from(documents).where(and(eq(documents.id, params.id), eq(documents.userId, user.id))).limit(1);
  if (!d) return fail("Not found.", 404);
  const q = new URL(req.url).searchParams;
  const rows = await db().select().from(chunks).where(eq(chunks.documentId, d.id)).orderBy(asc(chunks.idx));
  const hit = findCitedChunk(
    rows.map((c) => ({ idx: c.idx, text: c.text, sectionPath: c.sectionPath, page: c.page, stepNo: c.stepNo, chunkType: c.chunkType, tokenCount: c.tokenCount })),
    { section: q.get("section") ?? "", page: q.get("page") ?? "", step: q.get("step") ?? "" },
  );
  return json({ document: d.filename, passage: hit ? { section: hit.sectionPath, page: hit.page, text: hit.text } : null });
});
