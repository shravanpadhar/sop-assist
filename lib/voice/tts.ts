/** Browser text-to-speech: sentence-by-sentence playback, voice mapping, speed, pause, barge-in. */

export type Locale = "hi-IN" | "en-IN";
export type SpeakerState = "idle" | "speaking" | "paused";

export interface VoiceInfo {
  lang: string;
  name: string;
  default?: boolean;
}

/** Split text into speakable sentences (handles Hindi danda). */
export function splitSentences(text: string, maxLen = 220): string[] {
  const raw = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?।॥])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of raw) {
    if (s.length <= maxLen) {
      out.push(s);
      continue;
    }
    // very long sentence: break at commas / spaces
    let rest = s;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(",", maxLen);
      if (cut < maxLen / 2) cut = rest.lastIndexOf(" ", maxLen);
      if (cut <= 0) cut = maxLen;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

const norm = (l: string) => l.replace("_", "-").toLowerCase();

/** Pick the best voice for a locale. Hindi never falls back to a non-Hindi voice (returns null so the UI can show a notice). */
export function pickVoice<T extends VoiceInfo>(voices: T[], locale: Locale): T | null {
  const want = norm(locale);
  const prefix = want.split("-")[0];
  const exact = voices.find((v) => norm(v.lang) === want);
  if (exact) return exact;
  const same = voices.find((v) => norm(v.lang).startsWith(prefix + "-") || norm(v.lang) === prefix);
  if (same) return same;
  return null;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export interface SpeakerOptions {
  engine?: "browser" | "gemini";
  onState?: (s: SpeakerState) => void;
  /** called when no suitable voice exists for the locale */
  onNoVoice?: (locale: Locale) => void;
}

export class Speaker {
  private sentences: string[] = [];
  private index = 0;
  private locale: Locale = "en-IN";
  private rate = 1;
  private state: SpeakerState = "idle";
  private token = 0;
  private audio: HTMLAudioElement | null = null;
  private lastText = "";

  constructor(private opts: SpeakerOptions = {}) {}

  static supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  getState() {
    return this.state;
  }

  private setState(s: SpeakerState) {
    this.state = s;
    this.opts.onState?.(s);
  }

  voicesFor(locale: Locale): VoiceInfo[] {
    return Speaker.supported() ? window.speechSynthesis.getVoices().filter((v) => norm(v.lang).startsWith(locale.slice(0, 2).toLowerCase())) : [];
  }

  hasVoice(locale: Locale): boolean {
    return Speaker.supported() && pickVoice(window.speechSynthesis.getVoices(), locale) !== null;
  }

  async speak(text: string, locale: Locale, rate = this.rate) {
    this.stop();
    this.lastText = text;
    this.locale = locale;
    this.rate = rate;
    const my = ++this.token;
    if (this.opts.engine === "gemini") {
      const ok = await this.speakServer(text, locale, my);
      if (ok || my !== this.token) return;
    }
    this.sentences = splitSentences(text);
    this.index = 0;
    if (!Speaker.supported() || !this.sentences.length) return;
    if (!this.hasVoice(locale)) {
      this.opts.onNoVoice?.(locale);
      if (locale === "hi-IN") return; // do not read Hindi with an English voice
    }
    this.setState("speaking");
    this.next(my);
  }

  private next(my: number) {
    if (my !== this.token) return;
    if (this.index >= this.sentences.length) return this.setState("idle");
    const u = new SpeechSynthesisUtterance(this.sentences[this.index]);
    const v = pickVoice(window.speechSynthesis.getVoices(), this.locale);
    if (v) u.voice = v as unknown as SpeechSynthesisVoice;
    u.lang = this.locale;
    u.rate = this.rate;
    u.onend = () => {
      if (my !== this.token) return;
      this.index++;
      this.next(my);
    };
    u.onerror = () => {
      if (my === this.token) this.setState("idle");
    };
    window.speechSynthesis.speak(u);
  }

  private async speakServer(text: string, locale: Locale, my: number): Promise<boolean> {
    try {
      const res = await fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 1500), locale }) });
      if (!res.ok || my !== this.token) return false;
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      a.playbackRate = this.rate;
      a.onended = () => {
        URL.revokeObjectURL(url);
        if (my === this.token) this.setState("idle");
      };
      this.audio = a;
      this.setState("speaking");
      await a.play();
      return true;
    } catch {
      return false;
    }
  }

  pause() {
    if (this.state !== "speaking") return;
    if (this.audio) this.audio.pause();
    else window.speechSynthesis.pause();
    this.setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    if (this.audio) void this.audio.play();
    else window.speechSynthesis.resume();
    this.setState("speaking");
  }

  /** Change speed. Restarts the current sentence so the new speed applies immediately. */
  setRate(rate: number) {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
    else if (this.state !== "idle" && Speaker.supported()) {
      const my = ++this.token;
      window.speechSynthesis.cancel();
      this.setState("speaking");
      this.next(my);
    }
  }

  /** Stops immediately (used for barge-in when the user presses the mic). */
  stop() {
    this.token++;
    if (Speaker.supported()) window.speechSynthesis.cancel();
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (this.state !== "idle") this.setState("idle");
  }

  replay() {
    if (this.lastText) void this.speak(this.lastText, this.locale, this.rate);
  }
}
