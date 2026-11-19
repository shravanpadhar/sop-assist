import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { fetchOrThrow, ProviderError } from "@/lib/llm/base";
import { pcm16ToWav, sampleRateFromMime } from "./wav";

export interface TTSProvider {
  name: string;
  /** Returns WAV audio. */
  synthesize(text: string, locale: string): Promise<Buffer>;
}

export class GeminiTTS implements TTSProvider {
  name = "gemini";
  constructor(
    private apiKey: string,
    private model: string,
    private voice: string,
  ) {}
  async synthesize(text: string): Promise<Buffer> {
    const res = await fetchOrThrow(this.name, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
        },
      }),
    }, 40000);
    const data: any = await res.json();
    const inline = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
    if (!inline?.data) throw new ProviderError("no audio returned", this.name, 502);
    return pcm16ToWav(Buffer.from(inline.data, "base64"), sampleRateFromMime(inline.mimeType));
  }
}

export function createTTSProvider(): TTSProvider | null {
  const e = getEnv();
  if (e.TTS_ENGINE === "gemini" && e.GEMINI_API_KEY && e.GEMINI_TTS_MODEL) return new GeminiTTS(e.GEMINI_API_KEY, e.GEMINI_TTS_MODEL, e.GEMINI_TTS_VOICE);
  return null;
}

/** Small in-memory LRU keyed by hash of text + voice (best effort: per server instance). */
export class AudioCache {
  private map = new Map<string, Buffer>();
  constructor(private maxEntries = 50) {}
  static key(text: string, voice: string) {
    return createHash("sha256").update(`${voice}\n${text}`).digest("hex");
  }
  get(k: string) {
    const v = this.map.get(k);
    if (v) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: Buffer) {
    this.map.set(k, v);
    if (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value as string);
  }
}
export const audioCache = new AudioCache();
