import { getEnv, envProblems } from "@/lib/env";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Reports which providers are configured. Never returns key values. */
export async function GET() {
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
}
