import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/auth/validate";
import { setSessionCookie } from "@/lib/auth/session";
import { route, json, fail } from "@/lib/api";

export const POST = route({ name: "register", auth: false, ipLimitPerMin: 10 }, async (req) => {
  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const { email, password, name } = parsed.data;
  const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return fail("An account with this email already exists.", 409);
  const [u] = await db().insert(users).values({ email, name, passwordHash: await bcrypt.hash(password, 10) }).returning({ id: users.id });
  await setSessionCookie(u.id);
  return json({ ok: true, user: { id: u.id, email, name } }, 201);
});
