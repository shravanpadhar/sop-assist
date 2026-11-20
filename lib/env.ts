import { z } from "zod";

const bool = (v: string | undefined) => (v ?? "").toLowerCase() === "on" || v === "true";
const optInt = (def: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().nonnegative().default(def));

const schema = z.object({
  PRIVACY_NOTICE: z.string().default("Demo build: do not upload confidential documents."),
  LLM_PROVIDER: z.enum(["gemini", "groq"]).default("gemini"),
  LLM_FALLBACKS: z.string().default("groq"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_TTS_MODEL: z.string().optional(),
  GEMINI_TTS_VOICE: z.string().default("Kore"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_LLM_MODEL: z.string().optional(),
  GROQ_STT_MODEL: z.string().default("whisper-large-v3-turbo"),
  STT_ENGINE: z.enum(["groq", "gemini"]).default("groq"),
  TTS_ENGINE: z.enum(["browser", "gemini"]).default("browser"),
  HINGLISH_SPEECH_MODE: z.string().default("off"),
  DATABASE_URL: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_STORE_ID: z.string().optional(),
  JWT_SECRET: z.string().default("change-me"),
  MAX_UPLOAD_MB: optInt(10),
  FULL_CONTEXT_MAX_TOKENS: optInt(50000),
  BACKUP_MAX_CONTEXT_TOKENS: optInt(6000),
  APP_NAME: z.string().default("SOP Assist"),
  COMPANY_NAME: z.string().default("Your Company"),
  LIMIT_LLM_PER_MIN: optInt(10),
  LIMIT_LLM_PER_DAY: optInt(100),
  LIMIT_VOICE_PER_HOUR: optInt(20),
  LIMIT_GLOBAL_LLM_PER_DAY: optInt(1000),
  LIMIT_GLOBAL_STT_SECONDS_PER_DAY: optInt(28000),
  RETENTION_DAYS: optInt(0),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema> & { hinglishSpeech: boolean; isProd: boolean };

/** Treat empty strings as unset so a blank `.env` line behaves like a missing one. */
function clean(src: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined && v !== ""));
}

export function parseEnv(src: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(clean(src));
  if (!r.success) {
    const msg = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return { ...r.data, hinglishSpeech: bool(r.data.HINGLISH_SPEECH_MODE), isProd: src.NODE_ENV === "production" };
}

/** Returns human-readable problems with required values (never includes values). */
export function envProblems(src: Record<string, string | undefined> = process.env): string[] {
  const env = parseEnv(src);
  const p: string[] = [];
  if (!env.DATABASE_URL) p.push("DATABASE_URL is missing (Neon Postgres connection string).");
  if (env.isProd && env.JWT_SECRET === "change-me") p.push("JWT_SECRET must be changed from the default in production.");
  if (env.isProd && env.JWT_SECRET.length < 16) p.push("JWT_SECRET must be at least 16 characters in production.");
  const gemini = !!env.GEMINI_API_KEY && !!env.GEMINI_MODEL;
  const groq = !!env.GROQ_API_KEY && !!env.GROQ_LLM_MODEL;
  if (!gemini && !groq)
    p.push("No LLM is configured: set GEMINI_API_KEY + GEMINI_MODEL and/or GROQ_API_KEY + GROQ_LLM_MODEL.");
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) p.push("GEMINI_API_KEY is set but GEMINI_MODEL is empty.");
  if (env.GROQ_API_KEY && !env.GROQ_LLM_MODEL) p.push("GROQ_API_KEY is set but GROQ_LLM_MODEL is empty.");
  if (env.TTS_ENGINE === "gemini" && !env.GEMINI_TTS_MODEL) p.push("TTS_ENGINE=gemini needs GEMINI_TTS_MODEL.");
  return p;
}

let cached: Env | null = null;
export function getEnv(): Env {
  return (cached ??= parseEnv());
}
export function resetEnvCache() {
  cached = null;
}
