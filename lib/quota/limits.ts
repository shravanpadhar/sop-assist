import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usageCounters } from "@/lib/db/schema";

export type Period = "m" | "h" | "d";

export interface CounterStore {
  /** Atomically add to a counter and return the new totals. */
  incr(scope: string, kind: string, bucket: string, windowStart: Date, count: number, audioSeconds: number): Promise<{ count: number; audioSeconds: number }>;
}

export function bucketFor(period: Period, now = new Date()) {
  const d = new Date(now);
  if (period === "m") d.setUTCSeconds(0, 0);
  else if (period === "h") d.setUTCMinutes(0, 0, 0);
  else d.setUTCHours(0, 0, 0, 0);
  return { bucket: `${period}:${d.toISOString()}`, windowStart: d };
}

export const RETRY_AFTER: Record<Period, number> = { m: 60, h: 3600, d: 86400 };

export class QuotaError extends Error {
  constructor(public retryAfterSec: number, message = "The assistant is busy. Please try again in a minute.") {
    super(message);
  }
}

export class MemoryCounterStore implements CounterStore {
  data = new Map<string, { count: number; audioSeconds: number }>();
  async incr(scope: string, kind: string, bucket: string, _w: Date, count: number, audioSeconds: number) {
    const k = `${scope}|${kind}|${bucket}`;
    const cur = this.data.get(k) ?? { count: 0, audioSeconds: 0 };
    cur.count += count;
    cur.audioSeconds += audioSeconds;
    this.data.set(k, cur);
    return { ...cur };
  }
}

export class PgCounterStore implements CounterStore {
  async incr(scope: string, kind: string, bucket: string, windowStart: Date, count: number, audioSeconds: number) {
    const rows = await db()
      .insert(usageCounters)
      .values({ scope, kind, bucket, windowStart, count, audioSeconds })
      .onConflictDoUpdate({
        target: [usageCounters.scope, usageCounters.kind, usageCounters.bucket],
        set: {
          count: sql`${usageCounters.count} + ${count}`,
          audioSeconds: sql`${usageCounters.audioSeconds} + ${audioSeconds}`,
        },
      })
      .returning({ count: usageCounters.count, audioSeconds: usageCounters.audioSeconds });
    return rows[0];
  }
}

export interface Rule {
  scope: string;
  kind: string;
  period: Period;
  limit: number; // 0 = unlimited
  metric?: "count" | "audio";
  /** Amount to add (requests = 1, audio = seconds). */
  amount?: number;
  friendly?: string;
}

/**
 * Consume against all rules; throws QuotaError on the first rule that is exceeded.
 * Counters are incremented before the comparison so concurrent requests cannot slip through.
 */
export async function consume(store: CounterStore, rules: Rule[], now = new Date()) {
  for (const r of rules) {
    if (r.limit <= 0) continue;
    const { bucket, windowStart } = bucketFor(r.period, now);
    const metric = r.metric ?? "count";
    const amt = r.amount ?? 1;
    const res = await store.incr(r.scope, r.kind, bucket, windowStart, metric === "count" ? amt : 0, metric === "audio" ? amt : 0);
    const used = metric === "count" ? res.count : res.audioSeconds;
    if (used > r.limit) throw new QuotaError(RETRY_AFTER[r.period], r.friendly);
  }
}

export function llmRules(userId: string, env: { LIMIT_LLM_PER_MIN: number; LIMIT_LLM_PER_DAY: number; LIMIT_GLOBAL_LLM_PER_DAY: number }): Rule[] {
  return [
    { scope: `u:${userId}`, kind: "llm", period: "m", limit: env.LIMIT_LLM_PER_MIN },
    { scope: `u:${userId}`, kind: "llm", period: "d", limit: env.LIMIT_LLM_PER_DAY, friendly: "You have reached today's question limit. Please try again tomorrow." },
    { scope: "global", kind: "llm", period: "d", limit: env.LIMIT_GLOBAL_LLM_PER_DAY },
  ];
}

export function sttRules(userId: string, seconds: number, env: { LIMIT_VOICE_PER_HOUR: number; LIMIT_GLOBAL_STT_SECONDS_PER_DAY: number }): Rule[] {
  const friendly = "Voice input is busy or its quota is used up. Please type your question instead.";
  return [
    { scope: `u:${userId}`, kind: "stt", period: "h", limit: env.LIMIT_VOICE_PER_HOUR, friendly },
    { scope: `u:${userId}`, kind: "stt-sec", period: "h", limit: 1800, metric: "audio", amount: seconds, friendly },
    { scope: "global", kind: "stt-sec", period: "d", limit: env.LIMIT_GLOBAL_STT_SECONDS_PER_DAY, metric: "audio", amount: seconds, friendly },
  ];
}

export const pgStore = new PgCounterStore();
