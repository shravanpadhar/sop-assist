# PLAN (SOP Assist, spec v2.0 in SOP_SPEC.md.md)

Single Next.js (App Router, TS, Tailwind v4) project at the repo root. Free services only: Gemini (main LLM, vision, audio fallback),
Groq (Whisper STT + Llama backup), Neon Postgres (Drizzle, neon-http), Vercel Blob. No Docker, no local models.

Folders (see spec s15): app/(auth), app/(app), app/api/*, components/, lib/{db,ingestion,retrieval,llm,language,voice,quota,prompts,chat,auth},
tests/, eval/ (sample SOPs, questions, run.ts, audio sample), scripts/ (migrate, smoke), drizzle/ (generated SQL).

Key libs: next, drizzle-orm + @neondatabase/serverless + drizzle-kit, jose + bcryptjs (auth), zod (env/validation), @vercel/blob,
unpdf (PDF), mammoth (DOCX), SheetJS xlsx (CDN build), papaparse, minisearch (BM25), vitest, eslint-config-next, tsx.
LLM/STT calls use plain fetch against the Gemini and Groq REST APIs (no SDKs, small bundle, easy to mock).

Phase order: 1 Foundation -> 2 Ingestion -> 3 Text Q&A (BM25 Mode B included; embeddings/pgvector = optional 3b, skipped) ->
4 Voice -> 5 Interface -> 6 Hardening (limits, eval, security review, logging) -> 7 Deployment guide (README) -> SETUP_KEYS.md.
After each phase: tsc + lint + vitest, tick PROGRESS.md, update CLAUDE.md, git commit (never push).
