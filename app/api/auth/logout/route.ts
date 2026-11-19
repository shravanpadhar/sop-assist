import { clearSessionCookie } from "@/lib/auth/session";
import { route, json } from "@/lib/api";

export const POST = route({ name: "logout", auth: false }, async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
