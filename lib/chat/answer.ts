import type { LLMProvider } from "@/lib/llm/base";
import { generateWithFallback, withFallback } from "@/lib/llm/router";
import { extractJson } from "@/lib/ingestion/summarizer";
import { answerSchema, answerSystem, answerUserPrompt, REPAIR_SYSTEM, type Answer, type HistoryTurn } from "@/lib/prompts/answer";
import { REWRITE_SYSTEM } from "@/lib/prompts/classify";
import type { Lang } from "@/lib/language/detector";
import type { StoredChunk } from "@/lib/retrieval/bm25";
import { buildContext, chooseMode, type DocForContext, type RetrievalMode } from "@/lib/retrieval/context";
import { AnswerTextExtractor } from "./stream-extractor";

export interface AnswerInput {
  providers: LLMProvider[];
  doc: DocForContext;
  history: HistoryTurn[];
  question: string;
  language: Lang;
  hinglishSpeech: boolean;
  loadChunks: () => Promise<StoredChunk[]>;
  fullMaxTokens: number;
  backupMaxTokens: number;
  onDelta?: (text: string) => void;
  /** Called when a retry/fallback starts after partial output was already streamed. */
  onReset?: () => void;
}

export interface AnswerOutput {
  answer: Answer;
  provider: string;
  mode: RetrievalMode;
  repaired: boolean;
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\[(\d+|[^\]]*)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse model output into an Answer. Returns null when it is not valid JSON of the expected shape. */
export function parseAnswer(raw: string, language: Lang): Answer | null {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object") return null;
  const r = answerSchema.safeParse(obj);
  if (!r.success) return null;
  const a = r.data;
  return { ...a, language, speech_text: a.speech_text.trim() || stripMarkdown(a.answer_text) };
}

export function plainTextAnswer(raw: string, language: Lang): Answer {
  const text = raw.trim() || "Sorry, I could not produce an answer. Please try again.";
  return { language, answer_text: text, speech_text: stripMarkdown(text), citations: [], found_in_document: true };
}

async function rewriteQuery(provider: LLMProvider, question: string, history: HistoryTurn[], language: Lang): Promise<string> {
  if (!history.length && language === "en") return question;
  try {
    const hist = history.slice(-4).map((h) => `${h.role}: ${h.text.slice(0, 300)}`).join("\n");
    const { text } = await generateWithFallback([provider], {
      system: REWRITE_SYSTEM,
      messages: [{ role: "user", content: `CHAT HISTORY:\n${hist || "(none)"}\n\nQUESTION: ${question}` }],
      json: true,
      temperature: 0,
      maxTokens: 120,
      timeoutMs: 8000,
    }, { retries: 0 });
    const q = (extractJson(text) as { query?: unknown } | null)?.query;
    return typeof q === "string" && q.trim() ? `${q} ${question}` : question;
  } catch {
    return question;
  }
}

/** Generates a grounded answer, streaming answer_text through onDelta, with provider fallback and JSON repair. */
export async function generateAnswer(input: AnswerInput): Promise<AnswerOutput> {
  let mode: RetrievalMode = "full";
  let streamedAny = false;

  const { value: raw, provider } = await withFallback(input.providers, async (p, info) => {
    if (info.isRetry && streamedAny) input.onReset?.();
    streamedAny = false;
    mode = chooseMode(p, input.doc.tokenCount, input.fullMaxTokens);
    const query = mode === "retrieval" ? await rewriteQuery(p, input.question, input.history, input.language) : input.question;
    const ctx = await buildContext({
      mode,
      doc: input.doc,
      query,
      question: input.question,
      loadChunks: input.loadChunks,
      maxTokens: p.mode === "retrieval" ? input.backupMaxTokens : Math.max(input.backupMaxTokens, 12000),
    });
    const ex = new AnswerTextExtractor();
    let acc = "";
    for await (const piece of p.stream({
      system: answerSystem(input.hinglishSpeech),
      messages: [{ role: "user", content: answerUserPrompt({ language: input.language, summary: ctx.summary, context: ctx.context, history: input.history, question: input.question }) }],
      json: true,
      temperature: 0.2,
      maxTokens: 2048,
      timeoutMs: 50000,
    })) {
      acc += piece;
      const d = ex.push(piece);
      if (d) {
        streamedAny = true;
        input.onDelta?.(d);
      }
    }
    return acc;
  });

  let answer = parseAnswer(raw, input.language);
  let repaired = false;
  if (!answer) {
    repaired = true;
    try {
      const fix = await generateWithFallback([provider], { system: REPAIR_SYSTEM, messages: [{ role: "user", content: raw.slice(0, 8000) }], json: true, temperature: 0, maxTokens: 2048 }, { retries: 0 });
      answer = parseAnswer(fix.text, input.language);
    } catch {
      /* fall through to plain text */
    }
  }
  return { answer: answer ?? plainTextAnswer(raw, input.language), provider: provider.name, mode, repaired };
}
