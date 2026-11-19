import { getEnv, type Env } from "@/lib/env";
import { AllProvidersFailedError, ProviderError, type LLMProvider, type LLMRequest } from "./base";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { logger } from "@/lib/logger";

/** Ordered, configured providers: LLM_PROVIDER first, then LLM_FALLBACKS. Providers missing a key or model are skipped. */
export function createProviders(env: Env = getEnv()): LLMProvider[] {
  const order = [env.LLM_PROVIDER, ...env.LLM_FALLBACKS.split(",").map((s) => s.trim().toLowerCase())].filter(Boolean);
  const seen = new Set<string>();
  const out: LLMProvider[] = [];
  for (const name of order) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (name === "gemini" && env.GEMINI_API_KEY && env.GEMINI_MODEL) out.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL));
    if (name === "groq" && env.GROQ_API_KEY && env.GROQ_LLM_MODEL) out.push(new GroqProvider(env.GROQ_API_KEY, env.GROQ_LLM_MODEL));
  }
  return out;
}

export interface AttemptInfo {
  providerIndex: number;
  attempt: number;
  /** True if this is not the very first try (output from an earlier try may need to be discarded). */
  isRetry: boolean;
}

export interface FallbackOptions {
  retries?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` against each provider in order. On a retryable failure (429/5xx/network) retry the same provider once
 * after a short backoff, then move to the next provider. Non-retryable failures move on immediately.
 */
export async function withFallback<T>(
  providers: LLMProvider[],
  fn: (p: LLMProvider, info: AttemptInfo) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<{ value: T; provider: LLMProvider }> {
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? defaultSleep;
  const failures: { provider: string; message: string; status?: number }[] = [];
  let tries = 0;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const value = await fn(p, { providerIndex: i, attempt, isRetry: tries > 0 });
        return { value, provider: p };
      } catch (e) {
        tries++;
        const status = e instanceof ProviderError ? e.status : undefined;
        const retryable = e instanceof ProviderError ? e.retryable : true;
        const message = e instanceof Error ? e.message : String(e);
        logger.warn("llm_attempt_failed", { provider: p.name, attempt, status, message: message.slice(0, 200) });
        if (!(retryable && attempt < retries)) {
          failures.push({ provider: p.name, message, status });
          break;
        }
        await sleep((opts.backoffMs ?? 800) * (attempt + 1));
      }
    }
  }
  throw new AllProvidersFailedError(failures);
}

/** Convenience: single non-streaming call with fallback. */
export async function generateWithFallback(providers: LLMProvider[], req: LLMRequest, opts?: FallbackOptions) {
  const { value, provider } = await withFallback(providers, (p) => p.generate(req), opts);
  return { text: value, provider: provider.name };
}
