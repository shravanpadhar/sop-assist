import type { LLMProvider } from "@/lib/llm/base";
import { generateWithFallback } from "@/lib/llm/router";
import { SUMMARY_SYSTEM, summarySchema, summaryUserPrompt, type SopSummary } from "@/lib/prompts/summary";
import { estimateTokens } from "./normalizer";

export function extractJson(raw: string): unknown | null {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Trim the document to fit a token budget (keeps the start and end, which hold scope and revision info). */
export function fitToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 3;
  const head = Math.floor(maxChars * 0.8);
  return `${text.slice(0, head)}\n\n[...middle of document omitted...]\n\n${text.slice(-(maxChars - head))}`;
}

export interface SummaryResult {
  summary: SopSummary;
  provider: string;
}

/** One model call that returns summary, glossary and starter questions. */
export async function summarizeDocument(providers: LLMProvider[], text: string, filename: string, maxTokens: number): Promise<SummaryResult> {
  // The backup (Groq) has small limits, so leave generous headroom when it is the only provider.
  const budget = Math.min(maxTokens, providers.every((p) => p.mode === "retrieval") ? 5000 : maxTokens);
  const req = {
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user" as const, content: summaryUserPrompt(fitToTokens(text, budget), filename) }],
    json: true,
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 50000,
  };
  const { text: raw, provider } = await generateWithFallback(providers, req);
  let parsed = extractJson(raw);
  if (!parsed) {
    const retry = await generateWithFallback(providers, {
      ...req,
      messages: [{ role: "user", content: `Convert the following into valid JSON matching the required schema. Return only JSON.\n\n${raw}` }],
    });
    parsed = extractJson(retry.text);
  }
  const res = summarySchema.safeParse(parsed ?? {});
  const summary = res.success ? res.data : summarySchema.parse({});
  if (!summary.title) summary.title = filename.replace(/\.[^.]+$/, "");
  return { summary, provider };
}
