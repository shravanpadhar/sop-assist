# PROGRESS
- [x] Phase 1 Foundation
- [ ] Phase 2 Ingestion
- [ ] Phase 3 Text Q&A
- [ ] Phase 4 Voice
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
