import { describe, it, expect } from "vitest";
import { parseEnv, envProblems } from "@/lib/env";
import { consume, MemoryCounterStore, QuotaError, bucketFor, llmRules, sttRules } from "@/lib/quota/limits";
import { redact } from "@/lib/logger";

describe("env validation", () => {
  it("applies defaults and treats blank values as unset", () => {
    const e = parseEnv({ GEMINI_API_KEY: "", MAX_UPLOAD_MB: "" });
    expect(e.MAX_UPLOAD_MB).toBe(10);
    expect(e.GEMINI_API_KEY).toBeUndefined();
    expect(e.FULL_CONTEXT_MAX_TOKENS).toBe(50000);
  });
  it("reports missing required values without echoing secrets", () => {
    const p = envProblems({});
    expect(p.join(" ")).toMatch(/DATABASE_URL/);
    expect(p.join(" ")).toMatch(/No LLM/);
  });
  it("flags default JWT secret only in production", () => {
    const base = { DATABASE_URL: "x", GEMINI_API_KEY: "k", GEMINI_MODEL: "m", BLOB_READ_WRITE_TOKEN: "b" };
    expect(envProblems({ ...base, NODE_ENV: "development" })).toEqual([]);
    expect(envProblems({ ...base, NODE_ENV: "production" }).join(" ")).toMatch(/JWT_SECRET/);
  });
  it("flags key without model", () => {
    expect(envProblems({ DATABASE_URL: "x", GROQ_API_KEY: "k" }).join(" ")).toMatch(/GROQ_LLM_MODEL/);
  });
  it("rejects invalid enum values", () => {
    expect(() => parseEnv({ STT_ENGINE: "bogus" })).toThrow(/Invalid environment/);
  });
});

describe("quota", () => {
  const env = { LIMIT_LLM_PER_MIN: 2, LIMIT_LLM_PER_DAY: 100, LIMIT_GLOBAL_LLM_PER_DAY: 1000, LIMIT_VOICE_PER_HOUR: 2, LIMIT_GLOBAL_STT_SECONDS_PER_DAY: 100 };
  it("allows up to the limit then throws a friendly QuotaError", async () => {
    const s = new MemoryCounterStore();
    const now = new Date("2026-01-01T10:00:10Z");
    await consume(s, llmRules("u1", env), now);
    await consume(s, llmRules("u1", env), now);
    await expect(consume(s, llmRules("u1", env), now)).rejects.toBeInstanceOf(QuotaError);
  });
  it("resets in the next minute window and isolates users", async () => {
    const s = new MemoryCounterStore();
    const t1 = new Date("2026-01-01T10:00:10Z");
    await consume(s, llmRules("u1", env), t1);
    await consume(s, llmRules("u1", env), t1);
    await consume(s, llmRules("u2", env), t1);
    await consume(s, llmRules("u1", env), new Date("2026-01-01T10:01:00Z"));
  });
  it("limits audio seconds globally", async () => {
    const s = new MemoryCounterStore();
    await consume(s, sttRules("u1", 60, env));
    await expect(consume(s, sttRules("u2", 60, env))).rejects.toThrow(/Voice/);
  });
  it("treats limit 0 as unlimited and computes buckets", async () => {
    const s = new MemoryCounterStore();
    await consume(s, [{ scope: "g", kind: "k", period: "m", limit: 0 }]);
    expect(bucketFor("h", new Date("2026-01-01T10:33:20Z")).bucket).toBe("h:2026-01-01T10:00:00.000Z");
  });
});

describe("logger redaction", () => {
  it("redacts keys", () => {
    expect(redact('{"apiKey":"abc123"} AIzaSyA1234567890123456789012345 gsk_1234567890123456789012')).not.toMatch(/abc123|AIzaSy|gsk_1/);
  });
});
