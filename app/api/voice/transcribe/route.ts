import { fail, json, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { consume, pgStore, sttRules } from "@/lib/quota/limits";
import { AllProvidersFailedError } from "@/lib/llm/base";
import { clampSeconds, createSTTProviders, extensionForMime, transcribeWithFallback, validateClip } from "@/lib/voice/stt";
import { detectLanguage } from "@/lib/language/detector";
import { logger, errMsg } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UNAVAILABLE = "Voice input is not available right now. Please type your question instead.";

/** Audio clip in, transcript out. Audio is held in memory only and discarded after transcription. */
export const POST = route({ name: "transcribe", ipLimitPerMin: 30 }, async (req, { user }) => {
  const env = getEnv();
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return fail("No audio received.", 400);
  const mime = file.type || "audio/webm";
  const bad = validateClip(file.size, mime);
  if (bad) return fail(bad, 400);

  const providers = createSTTProviders(env);
  if (!providers.length) return fail(UNAVAILABLE, 503, { fallback: "text" });

  const durationRaw = Number(form?.get("duration"));
  const seconds = clampSeconds(Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null, file.size);
  await consume(pgStore, sttRules(user.id, seconds, env)); // throws QuotaError -> friendly 429

  const previous = (form?.get("previous_language") as string | null) ?? null;
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const t = await transcribeWithFallback(providers, { data, mimeType: mime, filename: `clip.${extensionForMime(mime)}` });
    const text = t.text.replace(/\s+/g, " ").trim();
    if (!text) return fail("I could not hear anything. Please try again or type your question.", 422);
    const d = detectLanguage(text, { previous: previous === "en" || previous === "hi" || previous === "hinglish" ? previous : null, whisperLanguage: t.language });
    return json({ text, detected_language: d.language, whisper_language: t.language ?? null, engine: t.engine });
  } catch (e) {
    logger.error("transcribe_failed", { message: errMsg(e) });
    const limited = e instanceof AllProvidersFailedError && e.rateLimited;
    return fail(limited ? "Voice input is busy. Please try again in a minute, or type your question." : UNAVAILABLE, 503, { fallback: "text" });
  }
});
