import { fetchOrThrow, sseData, type LLMProvider, type LLMRequest, ProviderError } from "./base";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiBody(req: LLMRequest) {
  const contents = req.messages.map((m, i) => {
    const parts: Record<string, unknown>[] = [];
    const isLast = i === req.messages.length - 1;
    if (isLast && m.role === "user" && req.files?.length) {
      for (const f of req.files) parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    }
    parts.push({ text: m.content });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxTokens) generationConfig.maxOutputTokens = req.maxTokens;
  if (req.json) generationConfig.responseMimeType = "application/json";
  return {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents,
    generationConfig,
  };
}

export function geminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("");
}

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  supportsFiles = true;
  mode = "full" as const;
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  private headers() {
    return { "Content-Type": "application/json", "x-goog-api-key": this.apiKey };
  }

  async generate(req: LLMRequest): Promise<string> {
    const res = await fetchOrThrow(this.name, `${BASE}/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(geminiBody(req)),
    }, req.timeoutMs);
    const text = geminiText(await res.json());
    if (!text) throw new ProviderError("empty response", this.name, 502);
    return text;
  }

  async *stream(req: LLMRequest): AsyncGenerator<string> {
    const res = await fetchOrThrow(this.name, `${BASE}/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(geminiBody(req)),
    }, req.timeoutMs);
    let any = false;
    for await (const d of sseData(res)) {
      try {
        const t = geminiText(JSON.parse(d));
        if (t) {
          any = true;
          yield t;
        }
      } catch {
        /* ignore malformed keep-alive */
      }
    }
    if (!any) throw new ProviderError("empty response", this.name, 502);
  }
}
