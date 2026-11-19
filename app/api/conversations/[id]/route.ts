import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";

export const dynamic = "force-dynamic";
const uuidRe = /^[0-9a-f-]{36}$/i;

function pub(m: typeof messages.$inferSelect) {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    speechText: m.speechText,
    language: m.detectedLanguage,
    citations: m.citationsJson ?? [],
    foundInDocument: m.foundInDocument,
    createdAt: m.createdAt,
  };
}

export const GET = route<{ id: string }>({ name: "conversation-get" }, async (_req, { user, params }) => {
  if (!uuidRe.test(params.id)) return fail("Not found.", 404);
  const [c] = await db().select().from(conversations).where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id))).limit(1);
  if (!c) return fail("Not found.", 404);
  const rows = await db().select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt));
  return json({ id: c.id, documentId: c.documentId, messages: rows.map(pub) });
});

/** Clears a conversation (deletes it and its messages). */
export const DELETE = route<{ id: string }>({ name: "conversation-delete" }, async (_req, { user, params }) => {
  if (!uuidRe.test(params.id)) return fail("Not found.", 404);
  const r = await db().delete(conversations).where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id))).returning({ id: conversations.id });
  if (!r.length) return fail("Not found.", 404);
  return json({ ok: true });
});
