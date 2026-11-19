/** Browser helper: send a recorded clip to the server for transcription. */
export interface TranscribeResult {
  text: string;
  detected_language: "en" | "hi" | "hinglish";
  whisper_language: string | null;
  engine: string;
}

export class TranscribeError extends Error {
  constructor(
    message: string,
    public fallbackToText: boolean,
  ) {
    super(message);
  }
}

export async function transcribeClip(blob: Blob, seconds: number, previousLanguage?: string | null): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("audio", blob, "clip");
  form.append("duration", String(Math.round(seconds)));
  if (previousLanguage) form.append("previous_language", previousLanguage);
  let res: Response;
  try {
    res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  } catch {
    throw new TranscribeError("Network error. Please type your question instead.", true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TranscribeError(data.error ?? "Voice input failed. Please type your question.", data.fallback === "text" || res.status === 429);
  return data as TranscribeResult;
}
