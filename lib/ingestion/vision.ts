import type { LLMProvider } from "@/lib/llm/base";
import { generateWithFallback } from "@/lib/llm/router";
import { VISION_PROMPT } from "@/lib/prompts/summary";

export class NoVisionProviderError extends Error {
  constructor() {
    super("This file looks like a scan and needs Gemini to read it. Configure GEMINI_API_KEY and GEMINI_MODEL, or upload a text-based file.");
  }
}

/** Ask a file-capable provider (Gemini) to transcribe a scanned PDF or image into structured Markdown. */
export async function extractWithVision(providers: LLMProvider[], buf: Buffer, mimeType: string): Promise<string> {
  const capable = providers.filter((p) => p.supportsFiles);
  if (!capable.length) throw new NoVisionProviderError();
  const { text } = await generateWithFallback(capable, {
    messages: [{ role: "user", content: VISION_PROMPT }],
    files: [{ mimeType, data: buf.toString("base64") }],
    temperature: 0,
    maxTokens: 32000,
    timeoutMs: 55000,
  });
  return text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/** Heuristic warning for unreliable OCR output. */
export function looksUnreliable(text: string): boolean {
  const illegible = (text.match(/\[illegible\]/gi) ?? []).length;
  return text.replace(/\s/g, "").length < 200 || illegible > 5;
}
