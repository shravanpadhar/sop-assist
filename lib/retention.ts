import { lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents, usageCounters } from "@/lib/db/schema";
import { deleteUpload } from "@/lib/storage";

export function retentionCutoff(days: number, now = new Date()): Date | null {
  if (!days || days <= 0) return null;
  return new Date(now.getTime() - days * 86_400_000);
}

/** Deletes documents (and, by cascade, chunks and chats) older than RETENTION_DAYS, plus stale quota counters. */
export async function purgeExpired(retentionDays: number, now = new Date()) {
  let removed = 0;
  const cutoff = retentionCutoff(retentionDays, now);
  if (cutoff) {
    const old = await db().delete(documents).where(lt(documents.createdAt, cutoff)).returning({ blobUrl: documents.blobUrl });
    for (const d of old) await deleteUpload(d.blobUrl);
    removed = old.length;
  }
  const counters = await db()
    .delete(usageCounters)
    .where(lt(usageCounters.windowStart, new Date(now.getTime() - 2 * 86_400_000)))
    .returning({ id: usageCounters.id });
  return { documentsRemoved: removed, countersRemoved: counters.length };
}
