import { fetchOrThrow, sseData, type LLMProvider, type LLMRequest, ProviderError } from "./base";

const URL_CHAT = "https://api.groq.com/openai/v1/chat/completions";

export function groqBody(model: string, req: LLMRequest, stream: boolean) {
  const messages = [
    ...(req.system ? [{ role: "system", content: req.system }] : []),
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  return {
    model,
    messages,
    stream,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
    // gpt-oss models spend completion tokens on hidden reasoning; keep it short so answers are not cut off.
    ...(/gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
  };
}

export class GroqProvider implements LLMProvider {
  name = "groq";
  supportsFiles = false;
  mode = "retrieval" as const;
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  private headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` };
  }

  async generate(req: LLMRequest): Promise<string> {
    if (req.files?.length) throw new ProviderError("Groq LLM does not accept files", this.name, 400);
    const res = await fetchOrThrow(this.name, URL_CHAT, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(groqBody(this.model, req, false)),
    }, req.timeoutMs);
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text) throw new ProviderError("empty response", this.name, 502);
    return text;
  }

  async *stream(req: LLMRequest): AsyncGenerator<string> {
    if (req.files?.length) throw new ProviderError("Groq LLM does not accept files", this.name, 400);
    const res = await fetchOrThrow(this.name, URL_CHAT, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(groqBody(this.model, req, true)),
    }, req.timeoutMs);
    let any = false;
    for await (const d of sseData(res)) {
      if (d === "[DONE]") break;
      try {
        const t = JSON.parse(d)?.choices?.[0]?.delta?.content;
        if (typeof t === "string" && t) {
          any = true;
          yield t;
        }
      } catch {
        /* ignore */
      }
    }
    if (!any) throw new ProviderError("empty response", this.name, 502);
  }
}
