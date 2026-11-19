import { z } from "zod";
import { fail, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { consume, pgStore } from "@/lib/quota/limits";
import { audioCache, AudioCache, createTTSProvider } from "@/lib/voice/tts-server";
import { logger, errMsg } from "@/lib/logger";

export const maxDuration = 60;

const schema = z.object({ text: z.string().trim().min(1).max(1500), locale: z.enum(["hi-IN", "en-IN"]).default("en-IN") });

/** Optional Gemini TTS (experimental, TTS_ENGINE=gemini). The browser falls back to speechSynthesis on any failure. */
export const POST = route({ name: "tts", ipLimitPerMin: 30 }, async (req, { user }) => {
  const provider = createTTSProvider();
  if (!provider) return fail("Server speech is not enabled.", 404);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid text.", 400);
  const { text, locale } = parsed.data;
  const key = AudioCache.key(text, `${getEnv().GEMINI_TTS_VOICE}:${locale}`);
  let wav = audioCache.get(key);
  if (!wav) {
    await consume(pgStore, [
      { scope: `u:${user.id}`, kind: "tts", period: "h", limit: 60, friendly: "Voice playback limit reached. The text answer is still available." },
      { scope: "global", kind: "tts", period: "d", limit: 500, friendly: "Voice playback is busy right now. The text answer is still available." },
    ]);
    try {
      wav = await provider.synthesize(text, locale);
      audioCache.set(key, wav);
    } catch (e) {
      logger.warn("tts_failed", { message: errMsg(e) });
      return fail("Could not generate speech. Using the device voice instead.", 503);
    }
  }
  return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" } });
});
