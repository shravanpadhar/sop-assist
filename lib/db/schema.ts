import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    fileHash: text("file_hash"),
    mimeType: text("mime_type").notNull().default(""),
    size: integer("size").notNull().default(0),
    language: text("language"),
    status: text("status", { enum: ["uploaded", "parsing", "summarizing", "ready", "failed"] }).notNull().default("uploaded"),
    errorMessage: text("error_message"),
    normalizedText: text("normalized_text"),
    summaryJson: jsonb("summary_json"),
    outlineJson: jsonb("outline_json"),
    glossaryJson: jsonb("glossary_json"),
    starterQuestionsJson: jsonb("starter_questions_json"),
    tokenCount: integer("token_count"),
    blobUrl: text("blob_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_user_idx").on(t.userId), index("documents_hash_idx").on(t.userId, t.fileHash)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull().default(0),
    text: text("text").notNull(),
    sectionPath: text("section_path"),
    page: text("page"),
    stepNo: integer("step_no"),
    chunkType: text("chunk_type").notNull().default("text"),
    tokenCount: integer("token_count").notNull().default(0),
  },
  (t) => [index("chunks_doc_idx").on(t.documentId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conv_user_doc_idx").on(t.userId, t.documentId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    text: text("text").notNull(),
    speechText: text("speech_text"),
    detectedLanguage: text("detected_language"),
    citationsJson: jsonb("citations_json"),
    foundInDocument: boolean("found_in_document"),
    latencyMs: integer("latency_ms"),
    providerUsed: text("provider_used"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1 up, -1 down
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per (scope, kind, bucket). scope = "u:<userId>" | "global" | "ip:<addr>". bucket = e.g. "m:2026-01-01T10:05:00.000Z". */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    audioSeconds: integer("audio_seconds").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_unique_idx").on(t.scope, t.kind, t.bucket)],
);
