import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { chunks, conversations, documents, messages } from "@/lib/db/schema";
import { fail, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { consume, llmRules, pgStore } from "@/lib/quota/limits";
import { createProviders, generateWithFallback } from "@/lib/llm/router";
import { AllProvidersFailedError } from "@/lib/llm/base";
import { resolveLanguage, parseClassification, speechLocale } from "@/lib/language/detector";
import { CLASSIFY_SYSTEM } from "@/lib/prompts/classify";
import { generateAnswer } from "@/lib/chat/answer";
import type { OutlineItem } from "@/lib/ingestion/normalizer";
import type { HistoryTurn } from "@/lib/prompts/answer";
import { logger, errMsg } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  document_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  conversation_id: z.string().uuid().optional().nullable(),
  whisper_language: z.string().max(30).optional().nullable(),
});

const HISTORY_TURNS = 8;
const BUSY = "The assistant is busy. Please try again in a minute.";

export const POST = route({ name: "chat", ipLimitPerMin: 60 }, async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Please type a question (up to 2000 characters).", 400);
  const { document_id, message, whisper_language } = parsed.data;
  const env = getEnv();

  const [doc] = await db().select().from(documents).where(and(eq(documents.id, document_id), eq(documents.userId, user.id))).limit(1);
  if (!doc) return fail("Document not found.", 404);
  if (doc.status !== "ready" || !doc.normalizedText) return fail("This document is not ready yet.", 409);

  const providers = createProviders(env);
  if (!providers.length) return fail("No AI provider is configured. Please contact your administrator.", 503);

  // Quota first, so we refuse politely before any provider does.
  await consume(pgStore, llmRules(user.id, env));

  // Conversation (must belong to this user and document).
  let convId = parsed.data.conversation_id ?? null;
  if (convId) {
    const [c] = await db().select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, user.id), eq(conversations.documentId, doc.id))).limit(1);
    if (!c) return fail("Conversation not found.", 404);
  } else {
    const [c] = await db().insert(conversations).values({ userId: user.id, documentId: doc.id }).returning({ id: conversations.id });
    convId = c.id;
  }
  const conversationId = convId;

  const histRows = await db()
    .select({ role: messages.role, text: messages.text, lang: messages.detectedLanguage })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_TURNS);
  const history: HistoryTurn[] = histRows.reverse().map((m) => ({ role: m.role, text: m.text }));
  const prevLang = [...histRows].reverse().find((m) => m.role === "user")?.lang as "en" | "hi" | "hinglish" | undefined;

  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const detection = await resolveLanguage(message, {
          previous: prevLang ?? null,
          whisperLanguage: whisper_language,
          classify: async (text) => {
            await consume(pgStore, llmRules(user.id, env));
            const { text: raw } = await generateWithFallback(providers, { system: CLASSIFY_SYSTEM, messages: [{ role: "user", content: text }], json: true, temperature: 0, maxTokens: 20, timeoutMs: 8000 }, { retries: 0 });
            return parseClassification(raw);
          },
        });
        const language = detection.language;
        await db().insert(messages).values({ conversationId, role: "user", text: message, detectedLanguage: language });
        send({ type: "meta", conversationId, language, speechLocale: speechLocale(language, env.hinglishSpeech) });

        const result = await generateAnswer({
          providers,
          doc: {
            filename: doc.filename,
            normalizedText: doc.normalizedText!,
            tokenCount: doc.tokenCount ?? 0,
            summary: (doc.summaryJson as Record<string, unknown> | null) ?? null,
            outline: (doc.outlineJson as OutlineItem[] | null) ?? [],
          },
          history,
          question: message,
          language,
          hinglishSpeech: env.hinglishSpeech,
          loadChunks: async () =>
            (await db().select().from(chunks).where(eq(chunks.documentId, doc.id)).orderBy(asc(chunks.idx))).map((c) => ({
              idx: c.idx,
              text: c.text,
              sectionPath: c.sectionPath,
              page: c.page,
              stepNo: c.stepNo,
              chunkType: c.chunkType,
              tokenCount: c.tokenCount,
            })),
          fullMaxTokens: env.FULL_CONTEXT_MAX_TOKENS,
          backupMaxTokens: env.BACKUP_MAX_CONTEXT_TOKENS,
          onDelta: (text) => send({ type: "delta", text }),
          onReset: () => send({ type: "reset" }),
        });

        const latency = Date.now() - started;
        const [saved] = await db()
          .insert(messages)
          .values({
            conversationId,
            role: "assistant",
            text: result.answer.answer_text,
            speechText: result.answer.speech_text,
            detectedLanguage: language,
            citationsJson: result.answer.citations,
            foundInDocument: result.answer.found_in_document,
            latencyMs: latency,
            providerUsed: `${result.provider}:${result.mode}`,
          })
          .returning({ id: messages.id });
        logger.info("chat_answer", { provider: result.provider, mode: result.mode, lang: language, ms: latency, repaired: result.repaired });
        send({ type: "final", messageId: saved.id, answer: result.answer, provider: result.provider, mode: result.mode, latencyMs: latency });
      } catch (e) {
        const rateLimited = e instanceof AllProvidersFailedError && e.rateLimited;
        logger.error("chat_failed", { message: errMsg(e) });
        send({ type: "error", message: rateLimited ? BUSY : "The assistant could not answer right now. Your conversation is saved; please try again in a moment.", retryable: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
