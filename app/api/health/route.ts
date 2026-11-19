import { getEnv, envProblems } from "@/lib/env";
import { json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Reports which providers are configured. Never returns key values. */
// No IP counter here so the health check keeps working even if the database is down.
export const GET = route({ name: "health", auth: false, ipLimitPerMin: 0 }, async () => {
  const e = getEnv();
  const problems = envProblems();
  return json({
    ok: problems.length === 0,
    problems,
    providers: {
      gemini: { key: !!e.GEMINI_API_KEY, model: !!e.GEMINI_MODEL },
      groq: { key: !!e.GROQ_API_KEY, llmModel: !!e.GROQ_LLM_MODEL, sttModel: !!e.GROQ_STT_MODEL },
    },
    llmOrder: [e.LLM_PROVIDER, ...e.LLM_FALLBACKS.split(",").map((s) => s.trim()).filter(Boolean)],
    sttEngine: e.STT_ENGINE,
    ttsEngine: e.TTS_ENGINE,
    database: !!e.DATABASE_URL,
    blob: e.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : e.isProd ? "missing" : "local-dev-fallback",
  });
});
