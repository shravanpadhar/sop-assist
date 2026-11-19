export interface LLMFile {
  mimeType: string;
  /** base64 data */
  data: string;
}
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}
export interface LLMRequest {
  system?: string;
  messages: LLMMessage[];
  /** Ask the model for a JSON object response. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Binary inputs (PDF/images/audio) attached to the last user message. Only providers with supportsFiles. */
  files?: LLMFile[];
  timeoutMs?: number;
}

export interface LLMProvider {
  name: string;
  supportsFiles: boolean;
  /** Approximate input token budget used to choose full-context vs retrieval mode. */
  mode: "full" | "retrieval";
  generate(req: LLMRequest): Promise<string>;
  stream(req: LLMRequest): AsyncGenerator<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public status?: number,
  ) {
    super(message);
  }
  /** Rate limit, overload, or network failure: worth one retry. */
  get retryable() {
    return this.status === undefined || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export class AllProvidersFailedError extends Error {
  constructor(public failures: { provider: string; message: string; status?: number }[]) {
    super(`All providers failed: ${failures.map((f) => `${f.provider}: ${f.message}`).join("; ")}`);
  }
  get rateLimited() {
    return this.failures.length > 0 && this.failures.every((f) => f.status === 429 || f.status === 503);
  }
}

/** Parse server-sent events from a fetch response body into data payload strings. */
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (data) yield data;
    }
  }
  const tail = buf
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (tail) yield tail;
}

export async function fetchOrThrow(provider: string, url: string, init: RequestInit, timeoutMs = 45000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ProviderError(e instanceof Error ? e.message : "network error", provider);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(`HTTP ${res.status} ${body}`.trim(), provider, res.status);
  }
  return res;
}
