import { getEnv, type Env } from "@/lib/env";
import { fetchOrThrow, ProviderError } from "@/lib/llm/base";
import { GeminiProvider } from "@/lib/llm/gemini";
import { withFallback } from "@/lib/llm/router";

export interface AudioClip {
  data: Buffer;
  mimeType: string;
  filename: string;
}
export interface Transcript {
  text: string;
  /** Language reported by the engine, if any (supporting signal only). */
  language?: string;
}
export interface STTProvider {
  name: string;
  transcribe(clip: AudioClip): Promise<Transcript>;
}

export const STT_PROMPT = "SOP, procedure, Hindi and English mixed";

export class GroqSTT implements STTProvider {
  name = "groq";
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async transcribe(clip: AudioClip): Promise<Transcript> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(clip.data)], { type: clip.mimeType }), clip.filename);
    form.append("model", this.model);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("prompt", STT_PROMPT);
    // No "language" field on purpose: Whisper auto-detects, so Hindi, English and Hinglish all work.
    const res = await fetchOrThrow(this.name, "https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    }, 30000);
    const data: any = await res.json();
    if (typeof data?.text !== "string") throw new ProviderError("bad transcription response", this.name, 502);
    return { text: data.text.trim(), language: typeof data.language === "string" ? data.language : undefined };
  }
}

export class GeminiSTT implements STTProvider {
  name = "gemini";
  private llm: GeminiProvider;
  constructor(apiKey: string, model: string) {
    this.llm = new GeminiProvider(apiKey, model);
  }
  async transcribe(clip: AudioClip): Promise<Transcript> {
    const text = await this.llm.generate({
      messages: [
        {
          role: "user",
          content:
            "Transcribe this audio exactly as spoken. The speaker may use English, Hindi or a mix (Hinglish). Write Hindi words in Devanagari and English words in Latin letters. Output only the transcript, nothing else. If there is no speech, output nothing.",
        },
      ],
      files: [{ mimeType: clip.mimeType.split(";")[0], data: clip.data.toString("base64") }],
      temperature: 0,
      maxTokens: 1024,
      timeoutMs: 30000,
    });
    return { text: text.trim() };
  }
}

export function createSTTProviders(env: Env = getEnv()): STTProvider[] {
  const groq: STTProvider | null = env.GROQ_API_KEY ? new GroqSTT(env.GROQ_API_KEY, env.GROQ_STT_MODEL) : null;
  const gemini: STTProvider | null = env.GEMINI_API_KEY && env.GEMINI_MODEL ? new GeminiSTT(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null;
  const order = env.STT_ENGINE === "gemini" ? [gemini, groq] : [groq, gemini];
  return order.filter((p): p is STTProvider => !!p);
}

/** Groq Whisper (retry once), then Gemini audio. Throws AllProvidersFailedError when nothing works. */
export async function transcribeWithFallback(providers: STTProvider[], clip: AudioClip) {
  const { value, provider } = await withFallback(providers, (p) => p.transcribe(clip));
  return { ...value, engine: provider.name };
}

export function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

export const MAX_CLIP_BYTES = 4 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 60;

export function validateClip(size: number, mime: string): string | null {
  if (size < 800) return "The recording is too short. Please try again.";
  if (size > MAX_CLIP_BYTES) return "The recording is too large. Please keep it under 60 seconds.";
  if (!/^(audio\/|video\/(webm|mp4))/i.test(mime)) return "Unsupported audio format.";
  return null;
}

export function clampSeconds(client: number | null, size: number): number {
  const estimated = Math.ceil(size / 6000); // ~48 kbps opus
  const s = client && Number.isFinite(client) && client > 0 ? client : estimated;
  return Math.min(MAX_CLIP_SECONDS, Math.max(1, Math.ceil(s)));
}
