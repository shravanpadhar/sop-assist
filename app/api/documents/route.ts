import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { validateUpload } from "@/lib/ingestion/files";
import { ingestDocument, IngestError } from "@/lib/ingestion/ingest";
import { isAllowedUploadUrl, deleteUpload } from "@/lib/storage";
import { consume, pgStore } from "@/lib/quota/limits";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = route({ name: "documents-list" }, async (_req, { user }) => {
  const rows = await db()
    .select({
      id: documents.id,
      filename: documents.filename,
      status: documents.status,
      size: documents.size,
      language: documents.language,
      errorMessage: documents.errorMessage,
      createdAt: documents.createdAt,
      summaryJson: documents.summaryJson,
    })
    .from(documents)
    .where(eq(documents.userId, user.id))
    .orderBy(desc(documents.createdAt))
    .limit(100);
  return json({
    documents: rows.map(({ summaryJson, ...r }) => ({ ...r, title: (summaryJson as { title?: string } | null)?.title ?? null })),
  });
});

const bodySchema = z.object({
  url: z.string().min(1).max(1000),
  filename: z.string().min(1).max(300),
  size: z.number().int().nonnegative().optional(),
  mimeType: z.string().max(200).optional(),
});

/** Starts ingestion for a file that the browser already uploaded. Runs inside this request. */
export const POST = route({ name: "documents-create", ipLimitPerMin: 20 }, async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request.", 400);
  const { url, filename, size, mimeType } = parsed.data;
  const env = getEnv();
  if (!isAllowedUploadUrl(url, user.id)) return fail("Invalid upload reference.", 400);
  const bad = validateUpload(filename, size ?? 1, mimeType ?? "", env.MAX_UPLOAD_MB);
  if (bad) {
    await deleteUpload(url);
    return fail(bad, 400);
  }
  await consume(pgStore, [{ scope: `u:${user.id}`, kind: "ingest", period: "h", limit: 20, friendly: "Too many documents processed this hour. Please try again later." }]);

  const [doc] = await db()
    .insert(documents)
    .values({ userId: user.id, filename, mimeType: mimeType ?? "", size: size ?? 0, blobUrl: url, status: "uploaded" })
    .returning({ id: documents.id });

  try {
    const out = await ingestDocument(doc.id, user.id);
    return json({ id: out.documentId, duplicate: out.duplicate, status: "ready" }, 201);
  } catch (e) {
    if (e instanceof IngestError) return fail(e.message, 422, { id: doc.id, status: "failed" });
    throw e;
  }
});
