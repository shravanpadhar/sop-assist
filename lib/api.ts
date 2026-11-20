import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { consume, QuotaError, pgStore } from "@/lib/quota/limits";
import { logger, errMsg } from "@/lib/logger";

/** Reject cross-site state-changing requests. Requests without an Origin header (server-to-server, curl) pass. */
export function originAllowed(req: Pick<Request, "method" | "headers">): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** True when the error chain shows the database could not be reached (DNS, network, wrong URL). */
export function isDbConnectionError(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 6; i++) {
    const m = cur instanceof Error ? cur.message : String(cur);
    if (/fetch failed|Error connecting to database|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(m)) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers });
}
export function fail(message: string, status = 400, extra: Record<string, unknown> = {}, headers?: Record<string, string>) {
  return NextResponse.json({ error: message, ...extra }, { status, headers });
}

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

interface Opts {
  name: string;
  auth?: boolean;
  /** Per-IP request cap per minute for this route (0 disables). Default 60. */
  ipLimitPerMin?: number;
}

type Handler<P> = (req: Request, ctx: { user: SessionUser; params: P }) => Promise<Response>;

/** Wraps a route handler: IP rate limit, auth, and unexpected-error handling. */
export function route<P = Record<string, string>>(opts: Opts, handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    const t0 = Date.now();
    const done = (res: Response) => {
      logger.info("request", { route: opts.name, method: req.method, status: res.status, ms: Date.now() - t0 });
      return res;
    };
    try {
      if (!originAllowed(req)) return done(fail("Cross-site request blocked.", 403));
      const limit = opts.ipLimitPerMin ?? 60;
      if (limit > 0) {
        await consume(pgStore, [{ scope: `ip:${clientIp(req)}`, kind: `route:${opts.name}`, period: "m", limit }]);
      }
      let user = null as SessionUser | null;
      if (opts.auth !== false) {
        user = await getSessionUser();
        if (!user) return done(fail("Please sign in.", 401));
      }
      const params = ((await ctx?.params) ?? {}) as P;
      return done(await handler(req, { user: user as SessionUser, params }));
    } catch (e) {
      if (e instanceof QuotaError) return done(fail(e.message, 429, { retryAfter: e.retryAfterSec }, { "Retry-After": String(e.retryAfterSec) }));
      logger.error("route_error", { route: opts.name, message: errMsg(e) });
      if (isDbConnectionError(e)) return done(fail("Cannot reach the database. Check your internet or DNS connection and the DATABASE_URL in .env.local, then try again.", 503));
      return done(fail("Something went wrong. Please try again.", 500));
    }
  };
}
