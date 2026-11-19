import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Latest conversation (with messages) for a document: GET /api/conversations?document_id=... */
export const GET = route({ name: "conversations-latest" }, async (req, { user }) => {
  const docId = new URL(req.url).searchParams.get("document_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return fail("document_id is required.", 400);
  const [c] = await db()
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.documentId, docId)))
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (!c) return json({ conversationId: null, messages: [] });
  const rows = await db().select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt));
  return json({ conversationId: c.id, messages: rows.map(publicMessage) });
});

function publicMessage(m: typeof messages.$inferSelect) {
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
