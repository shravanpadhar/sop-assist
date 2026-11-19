# PROGRESS
- [x] Phase 1 Foundation
- [x] Phase 2 Ingestion
- [x] Phase 3 Text Q&A (3b embeddings skipped; BM25 only)
- [x] Phase 4 Voice
- [ ] Phase 5 Interface
- [ ] Phase 6 Hardening
- [ ] Phase 7 Deployment guide (README)
- [ ] SETUP_KEYS.md + final summary

## Decisions / deviations (record here)
- usage_counters uses (scope, kind, bucket) instead of nullable user_id so IP/global/user limits share one table. Added documents.error_message, messages.speech_text/found_in_document, feedback.user_id.
- shadcn/ui CLI is interactive, so UI primitives are hand-written Tailwind components. Dark mode skipped (spec: optional).
- SheetJS installed from the official CDN tarball (npm xlsx is stale/vulnerable). Next 16, TS 6, vitest 5, zod 4.
- Embeddings/pgvector (Phase 3b, optional) skipped; BM25 only.
- Shell heredocs of very long scripts fail in this tool; write files with the Write tool.
- Blobs are uploaded as access:'private' under u/<userId>/ and read server-side with get(); client must use that prefix (GET /api/documents/upload-token returns it). Images (png/jpg/webp) are also accepted and read by Gemini vision.
- Ingestion runs inside POST /api/documents (maxDuration 60); status persisted at parsing -> summarizing -> ready/failed. Outline is built deterministically from headings, not by the LLM. Docs > 1.5M chars are rejected with a clear message.
- LLM layer (lib/llm) built in Phase 2 because summarizer/vision need it.
- Chat protocol: POST /api/chat streams NDJSON events: meta{conversationId,language,speechLocale} | delta{text} | reset | final{messageId,answer,...} | error{message}. Pre-stream failures return JSON with HTTP status (429 quota, 404, 409 not ready).
- Query rewrite (LLM) only runs in retrieval mode and only if history exists or language != en; failures fall back to the raw question. Language tie-breaker LLM call only for ambiguous input and counts against the LLM quota.
- GET /api/conversations?document_id= returns latest conversation + messages (used by UI on open). DELETE /api/conversations/[id] clears it.
- Voice: server in lib/voice/{stt,tts-server,wav}.ts + /api/voice/{transcribe,tts}; browser libs lib/voice/{recorder,tts,client}.ts are UI-ready (wired in Phase 5). Gemini TTS audio cache is an in-memory LRU per instance (best effort). Added env GEMINI_TTS_VOICE (default Kore, a voice name not a model).
- Transcribe response: {text, detected_language (our detector), whisper_language, engine}; failures return fallback:"text".
