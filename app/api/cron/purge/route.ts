import { timingSafeEqual } from "node:crypto";
import { fail, json, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { purgeExpired } from "@/lib/retention";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Daily cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export const GET = route({ name: "cron-purge", auth: false, ipLimitPerMin: 10 }, async (req) => {
  const e = getEnv();
  if (!e.CRON_SECRET) return fail("Not configured.", 404);
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${e.CRON_SECRET}`)) return fail("Unauthorized.", 401);
  return json(await purgeExpired(e.RETENTION_DAYS));
});
