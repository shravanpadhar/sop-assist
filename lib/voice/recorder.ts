/** Browser-only voice recorder with waveform levels, silence auto-stop, a 60 second cap and cancel. */

export const MAX_RECORD_SECONDS = 60;
export const SILENCE_MS = 1500;

/** Pure silence detector, unit tested. Feed it a level (0..1) every tick. */
export class SilenceDetector {
  private speechMs = 0;
  private silenceMs = 0;
  private heardSpeech = false;
  constructor(
    private opts: { threshold?: number; silenceMs?: number; minSpeechMs?: number; noSpeechTimeoutMs?: number } = {},
  ) {}
  /** Returns "stop" when speech has ended, "no-speech" when nothing was said for too long, else "continue". */
  update(level: number, dtMs: number): "continue" | "stop" | "no-speech" {
    const threshold = this.opts.threshold ?? 0.02;
    if (level >= threshold) {
      this.speechMs += dtMs;
      this.silenceMs = 0;
      if (this.speechMs >= (this.opts.minSpeechMs ?? 200)) this.heardSpeech = true;
      return "continue";
    }
    this.silenceMs += dtMs;
    if (this.heardSpeech && this.silenceMs >= (this.opts.silenceMs ?? SILENCE_MS)) return "stop";
    if (!this.heardSpeech && this.silenceMs >= (this.opts.noSpeechTimeoutMs ?? 8000)) return "no-speech";
    return "continue";
  }
  get hasSpeech() {
    return this.heardSpeech;
  }
}

export type MicErrorCode = "denied" | "no-device" | "unsupported" | "other";
export class MicError extends Error {
  constructor(
    public code: MicErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type StopReason = "silence" | "cap" | "manual" | "cancel" | "no-speech";
export interface RecordingResult {
  blob: Blob;
  seconds: number;
  mimeType: string;
}

export interface RecorderCallbacks {
  /** level 0..1 and the last N levels for a waveform display */
  onLevel?: (level: number, wave: number[]) => void;
  onTick?: (seconds: number) => void;
  /** result is null when cancelled or when nothing was recorded */
  onStop: (result: RecordingResult | null, reason: StopReason) => void;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickMimeType(isSupported: (t: string) => boolean): string | undefined {
  return MIME_CANDIDATES.find((t) => isSupported(t));
}

export function recorderSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private parts: Blob[] = [];
  private startedAt = 0;
  private wave: number[] = [];
  private finished = false;
  private detector = new SilenceDetector();

  constructor(
    private cb: RecorderCallbacks,
    private opts: { handsFree?: boolean } = {},
  ) {}

  async start(): Promise<void> {
    if (!recorderSupported()) throw new MicError("unsupported", "This browser does not support voice recording. Please type your question.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", "Microphone access is blocked. Allow it in your browser's site settings, then try again.");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("no-device", "No microphone was found.");
      throw new MicError("other", "Could not start the microphone.");
    }
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.parts.push(e.data);
    this.rec.onstop = () => this.finish();

    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    this.startedAt = Date.now();
    this.rec.start(250);
    const tick = 50;
    this.timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3);
      this.wave.push(level);
      if (this.wave.length > 40) this.wave.shift();
      this.cb.onLevel?.(level, [...this.wave]);
      const secs = (Date.now() - this.startedAt) / 1000;
      this.cb.onTick?.(secs);
      if (secs >= MAX_RECORD_SECONDS) return this.stop("cap");
      if (this.opts.handsFree) {
        const r = this.detector.update(level, tick);
        if (r === "stop") this.stop("silence");
        else if (r === "no-speech") this.cancelWith("no-speech");
      }
    }, tick);
  }

  private reason: StopReason = "manual";
  private discard = false;

  stop(reason: StopReason = "manual") {
    if (this.finished || !this.rec || this.rec.state === "inactive") return;
    this.reason = reason;
    this.rec.stop();
  }

  cancel() {
    this.cancelWith("cancel");
  }

  private cancelWith(reason: StopReason) {
    this.discard = true;
    this.reason = reason;
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    else this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    const mimeType = this.rec?.mimeType || "audio/webm";
    const seconds = Math.max(0.1, (Date.now() - this.startedAt) / 1000);
    const blob = new Blob(this.parts, { type: mimeType });
    this.parts = [];
    this.cb.onStop(this.discard || blob.size === 0 ? null : { blob, seconds, mimeType }, this.reason);
  }
}
