import { describe, it, expect } from "vitest";
import { SilenceDetector, pickMimeType } from "@/lib/voice/recorder";
import { pickVoice, splitSentences } from "@/lib/voice/tts";
import { pcm16ToWav, sampleRateFromMime } from "@/lib/voice/wav";
import { AudioCache } from "@/lib/voice/tts-server";
import { GroqSTT, clampSeconds, createSTTProviders, extensionForMime, transcribeWithFallback, validateClip, type STTProvider } from "@/lib/voice/stt";
import { parseEnv } from "@/lib/env";
import { ProviderError } from "@/lib/llm/base";
import * as llmRouter from "@/lib/llm/router";

describe("SilenceDetector", () => {
  it("stops after 1.5s of silence following speech", () => {
    const d = new SilenceDetector();
    for (let i = 0; i < 10; i++) expect(d.update(0.2, 50)).toBe("continue");
    let r = "continue";
    let t = 0;
    while (r === "continue" && t < 3000) {
      r = d.update(0, 50);
      t += 50;
    }
    expect(r).toBe("stop");
    expect(t).toBeGreaterThanOrEqual(1500);
    expect(t).toBeLessThan(1700);
  });
  it("does not stop on silence before any speech, but gives up after the timeout", () => {
    const d = new SilenceDetector({ noSpeechTimeoutMs: 2000 });
    let r = "continue";
    for (let t = 0; t < 1900; t += 50) r = d.update(0, 50);
    expect(r).toBe("continue");
    expect(d.update(0, 200)).toBe("no-speech");
  });
  it("short blips do not count as speech", () => {
    const d = new SilenceDetector({ noSpeechTimeoutMs: 1000 });
    d.update(0.5, 50);
    for (let t = 0; t < 900; t += 50) d.update(0, 50);
    expect(d.update(0, 100)).toBe("no-speech");
  });
  it("picks a supported mime type", () => {
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});

describe("text to speech helpers", () => {
  it("splits sentences including Hindi danda", () => {
    expect(splitSentences("पहला चरण। दूसरा चरण! Third step? Done.")).toEqual(["पहला चरण।", "दूसरा चरण!", "Third step?", "Done."]);
    expect(splitSentences("a".repeat(500) + ", " + "b".repeat(100)).every((s) => s.length <= 260)).toBe(true);
  });
  const voices = [
    { lang: "en-US", name: "US" },
    { lang: "en_IN", name: "India" },
    { lang: "hi-IN", name: "Hindi" },
  ];
  it("maps locales to voices and never uses a non-Hindi voice for Hindi", () => {
    expect(pickVoice(voices, "hi-IN")?.name).toBe("Hindi");
    expect(pickVoice(voices, "en-IN")?.name).toBe("India");
    expect(pickVoice([{ lang: "en-US", name: "US" }], "en-IN")?.name).toBe("US");
    expect(pickVoice([{ lang: "en-US", name: "US" }], "hi-IN")).toBeNull();
  });
});

describe("wav and cache", () => {
  it("wraps PCM in a valid WAV header", () => {
    const wav = pcm16ToWav(Buffer.alloc(100), 24000);
    expect(wav.length).toBe(144);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(100);
    expect(sampleRateFromMime("audio/L16;codec=pcm;rate=16000")).toBe(16000);
    expect(sampleRateFromMime(undefined)).toBe(24000);
  });
  it("evicts the least recently used entry", () => {
    const c = new AudioCache(2);
    c.set("a", Buffer.from("1"));
    c.set("b", Buffer.from("2"));
    c.get("a");
    c.set("c", Buffer.from("3"));
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBeDefined();
    expect(AudioCache.key("x", "v")).toHaveLength(64);
  });
});

describe("speech to text", () => {
  it("validates clips and clamps duration", () => {
    expect(validateClip(100, "audio/webm")).toMatch(/too short/);
    expect(validateClip(5 * 1024 * 1024, "audio/webm")).toMatch(/too large/);
    expect(validateClip(5000, "text/plain")).toMatch(/Unsupported/);
    expect(validateClip(5000, "audio/webm;codecs=opus")).toBeNull();
    expect(clampSeconds(500, 1000)).toBe(60);
    expect(clampSeconds(null, 60000)).toBe(10);
    expect(extensionForMime("audio/mp4")).toBe("mp4");
  });
  it("orders providers by STT_ENGINE and skips unconfigured ones", () => {
    const env = parseEnv({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k", GEMINI_MODEL: "m" });
    expect(createSTTProviders(env).map((p) => p.name)).toEqual(["groq", "gemini"]);
    expect(createSTTProviders({ ...env, STT_ENGINE: "gemini" }).map((p) => p.name)).toEqual(["gemini", "groq"]);
    expect(createSTTProviders(parseEnv({ GROQ_API_KEY: "k" })).map((p) => p.name)).toEqual(["groq"]);
    expect(createSTTProviders(parseEnv({}))).toEqual([]);
  });
  it("retries Groq once, then falls back to Gemini audio", async () => {
    const calls: string[] = [];
    const groq: STTProvider = { name: "groq", transcribe: async () => { calls.push("groq"); throw new ProviderError("rate", "groq", 429); } };
    const gem: STTProvider = { name: "gemini", transcribe: async () => { calls.push("gemini"); return { text: "leave kaise" }; } };
    // avoid real sleeping in the default backoff
    const orig = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => orig(fn, 0)) as unknown as typeof setTimeout;
    try {
      const r = await transcribeWithFallback([groq, gem], { data: Buffer.from("x"), mimeType: "audio/webm", filename: "clip.webm" });
      expect(r).toMatchObject({ text: "leave kaise", engine: "gemini" });
      expect(calls).toEqual(["groq", "groq", "gemini"]);
    } finally {
      globalThis.setTimeout = orig;
    }
  });
  it("sends Whisper requests without a language field", async () => {
    let form: FormData | undefined;
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
      form = init.body as FormData;
      return new Response(JSON.stringify({ text: " नमस्ते ", language: "hindi" }), { status: 200 });
    }) as typeof fetch;
    try {
      const t = await new GroqSTT("key", "whisper-x").transcribe({ data: Buffer.from("abc"), mimeType: "audio/webm", filename: "clip.webm" });
      expect(t).toEqual({ text: "नमस्ते", language: "hindi" });
      expect(form!.has("language")).toBe(false);
      expect(form!.get("model")).toBe("whisper-x");
      expect(String(form!.get("prompt"))).toMatch(/Hindi/);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("keeps the router module importable", () => {
    expect(typeof llmRouter.withFallback).toBe("function");
  });
});
