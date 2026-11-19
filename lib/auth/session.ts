import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export const COOKIE = "sop_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function key() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export async function signToken(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, await signToken(userId), {
    httpOnly: true,
    secure: getEnv().isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = await verifyToken(token);
  if (!id) return null;
  const rows = await db().select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}
