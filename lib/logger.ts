const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /gsk_[0-9A-Za-z]{20,}/g,
  /((?:api[_-]?key|authorization|token|secret|password)"?\s*[:=]\s*"?)([^\s",}]+)/gi,
];

export function redact(s: string) {
  let out = s;
  out = out.replace(SECRET_PATTERNS[0], "[redacted]").replace(SECRET_PATTERNS[1], "[redacted]");
  out = out.replace(SECRET_PATTERNS[2], (_m, a) => `${a}[redacted]`);
  return out;
}

type Level = "info" | "warn" | "error";
export function log(level: Level, event: string, data: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = redact(JSON.stringify({ t: new Date().toISOString(), level, event, ...data }));
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
export const logger = {
  info: (e: string, d?: Record<string, unknown>) => log("info", e, d),
  warn: (e: string, d?: Record<string, unknown>) => log("warn", e, d),
  error: (e: string, d?: Record<string, unknown>) => log("error", e, d),
};
export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
