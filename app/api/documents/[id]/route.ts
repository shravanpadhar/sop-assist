import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";
import { deleteUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = route<{ id: string }>({ name: "documents-get" }, async (_req, { user, params }) => {
  if (!uuidRe.test(params.id)) return fail("Not found.", 404);
  const [d] = await db().select().from(documents).where(and(eq(documents.id, params.id), eq(documents.userId, user.id))).limit(1);
  if (!d) return fail("Not found.", 404);
  return json({
    id: d.id,
    filename: d.filename,
    status: d.status,
    errorMessage: d.errorMessage,
    language: d.language,
    size: d.size,
    tokenCount: d.tokenCount,
    summary: d.summaryJson,
    outline: d.outlineJson,
    glossary: d.glossaryJson,
    starterQuestions: d.starterQuestionsJson ?? [],
    createdAt: d.createdAt,
  });
});

export const DELETE = route<{ id: string }>({ name: "documents-delete" }, async (_req, { user, params }) => {
  if (!uuidRe.test(params.id)) return fail("Not found.", 404);
  const [d] = await db()
    .delete(documents)
    .where(and(eq(documents.id, params.id), eq(documents.userId, user.id)))
    .returning({ blobUrl: documents.blobUrl });
  if (!d) return fail("Not found.", 404);
  await deleteUpload(d.blobUrl);
  return json({ ok: true });
});
