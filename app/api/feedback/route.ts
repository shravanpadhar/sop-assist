import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { conversations, feedback, messages } from "@/lib/db/schema";
import { fail, json, route } from "@/lib/api";

const schema = z.object({
  message_id: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(1000).optional(),
});

export const POST = route({ name: "feedback" }, async (req, { user }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid feedback.", 400);
  const { message_id, rating, comment } = parsed.data;
  const [m] = await db()
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, message_id), eq(conversations.userId, user.id), eq(messages.role, "assistant")))
    .limit(1);
  if (!m) return fail("Message not found.", 404);
  await db().delete(feedback).where(and(eq(feedback.messageId, message_id), eq(feedback.userId, user.id)));
  await db().insert(feedback).values({ messageId: message_id, userId: user.id, rating, comment });
  return json({ ok: true });
});
