import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { createProviders } from "@/lib/llm/router";
import { deleteUpload, readUpload } from "@/lib/storage";
import { logger, errMsg } from "@/lib/logger";
import { AllProvidersFailedError } from "@/lib/llm/base";
import { kindOf, mimeForKind, sniffMatches, validateUpload } from "./files";
import { parseBuffer } from "./parsers";
import { buildOutline, detectDocLanguage, estimateTokens, normalizeText } from "./normalizer";
import { chunkDocument } from "./chunker";
import { extractWithVision, looksUnreliable, NoVisionProviderError } from "./vision";
import { summarizeDocument } from "./summarizer";

/** About 400k tokens of text. Larger documents cannot be processed within the serverless time limit. */
export const MAX_DOC_CHARS = 1_500_000;

export class IngestError extends Error {}

async function setStatus(id: string, status: "parsing" | "summarizing", extra: Partial<typeof documents.$inferInsert> = {}) {
  await db().update(documents).set({ status, ...extra }).where(eq(documents.id, id));
}

async function markFailed(id: string, message: string) {
  await db().update(documents).set({ status: "failed", errorMessage: message }).where(eq(documents.id, id));
}

export type IngestOutcome = { documentId: string; duplicate: boolean };

/** Runs the whole pipeline inside one request. Progress is saved to the database after each stage. */
export async function ingestDocument(docId: string, userId: string): Promise<IngestOutcome> {
  const env = getEnv();
  const [doc] = await db().select().from(documents).where(and(eq(documents.id, docId), eq(documents.userId, userId))).limit(1);
  if (!doc) throw new IngestError("Document not found.");
  const started = Date.now();
  try {
    await setStatus(docId, "parsing", { errorMessage: null });
    if (!doc.blobUrl) throw new IngestError("No uploaded file is attached to this document.");
    const buf = await readUpload(doc.blobUrl);
    const kind = kindOf(doc.filename);
    if (!kind) throw new IngestError("Unsupported file type.");
    const bad = validateUpload(doc.filename, buf.length, doc.mimeType, env.MAX_UPLOAD_MB);
    if (bad) throw new IngestError(bad);
    if (!sniffMatches(kind, buf)) throw new IngestError("The file contents do not match its extension.");

    const hash = createHash("sha256").update(buf).digest("hex");
    const [dup] = await db()
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.fileHash, hash), eq(documents.status, "ready"), ne(documents.id, docId)))
      .limit(1);
    if (dup) {
      await db().delete(documents).where(eq(documents.id, docId));
      await deleteUpload(doc.blobUrl);
      return { documentId: dup.id, duplicate: true };
    }
    await db().update(documents).set({ fileHash: hash, size: buf.length }).where(eq(documents.id, docId));

    const providers = createProviders(env);
    const warnings: string[] = [];
    let parsed = await parseBuffer(buf, kind, doc.filename);
    if (parsed.needsVision) {
      const text = await extractWithVision(providers, buf, mimeForKind(kind, doc.filename));
      parsed = { ...parsed, text, needsVision: false };
      if (looksUnreliable(text)) warnings.push("The text extracted from this scan may be unreliable. Check answers against the original.");
    }

    const normalized = normalizeText(parsed.text, kind);
    if (normalized.replace(/\s/g, "").length < 20) throw new IngestError("No readable text was found in this file.");
    if (normalized.length > MAX_DOC_CHARS) {
      throw new IngestError("This document is too large to process. Please split it into parts of roughly 150 pages or fewer.");
    }
    const tokenCount = estimateTokens(normalized);
    const outline = buildOutline(normalized);
    const docChunks = chunkDocument(normalized);

    await setStatus(docId, "summarizing", {
      normalizedText: normalized,
      tokenCount,
      language: detectDocLanguage(normalized),
      outlineJson: outline,
    });

    if (!providers.length) throw new IngestError("No AI provider is configured, so the document cannot be summarized. See SETUP_KEYS.md.");
    const { summary } = await summarizeDocument(providers, normalized, doc.filename, env.FULL_CONTEXT_MAX_TOKENS);

    await db().delete(chunks).where(eq(chunks.documentId, docId));
    for (let i = 0; i < docChunks.length; i += 100) {
      await db().insert(chunks).values(docChunks.slice(i, i + 100).map((c) => ({ documentId: docId, ...c })));
    }

    const { glossary, starter_questions, ...summaryOnly } = summary;
    await db()
      .update(documents)
      .set({
        status: "ready",
        summaryJson: { ...summaryOnly, warnings },
        glossaryJson: glossary,
        starterQuestionsJson: starter_questions.slice(0, 5),
        errorMessage: null,
      })
      .where(eq(documents.id, docId));
    logger.info("ingest_done", { docId, kind, tokens: tokenCount, chunks: docChunks.length, ms: Date.now() - started });
    return { documentId: docId, duplicate: false };
  } catch (e) {
    const friendly =
      e instanceof AllProvidersFailedError
        ? "The AI service rejected the request (your file is fine). Check GEMINI_API_KEY/GEMINI_MODEL and GROQ_API_KEY/GROQ_LLM_MODEL in .env.local, then try again. Details are in the server log."
        : e instanceof IngestError || e instanceof NoVisionProviderError
        ? e.message
        : "We could not process this document. Please try again, or upload a different version of the file.";
    logger.error("ingest_failed", { docId, message: errMsg(e) });
    await markFailed(docId, friendly);
    throw new IngestError(friendly);
  }
}
