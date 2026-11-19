import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/auth/validate";
import { setSessionCookie } from "@/lib/auth/session";
import { route, json, fail } from "@/lib/api";
import { consume, pgStore } from "@/lib/quota/limits";

// Compared when the user is unknown so response timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const POST = route({ name: "login", auth: false, ipLimitPerMin: 10 }, async (req) => {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Enter a valid email and password.", 400);
  const { email, password } = parsed.data;
  // Per-account throttle against password guessing from many IPs.
  await consume(pgStore, [{ scope: `login:${email}`, kind: "login", period: "h", limit: 30, friendly: "Too many sign-in attempts. Please try again later." }]);
  const [u] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) return fail("Incorrect email or password.", 401);
  await setSessionCookie(u.id);
  return json({ ok: true, user: { id: u.id, email: u.email, name: u.name } });
});
