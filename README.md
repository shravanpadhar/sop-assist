# SOP Assist

Voice-enabled SOP knowledge assistant. Employees upload a Standard Operating Procedure, then ask questions by **voice or text** in **English, Hindi or Hinglish**. Answers come back in the same language, as text and speech, grounded only in the document, with citations.

Free-tier only at runtime: Google Gemini (main LLM, reads scans), Groq (Whisper speech-to-text and a Llama backup), Neon Postgres, Vercel Blob. One Next.js project, deployed to Vercel. No Docker, no local models.

Spec: `SOP_SPEC.md.md` (v2.0). Build status and decisions: `PROGRESS.md`, `CLAUDE.md`. Key setup checklist: `SETUP_KEYS.md`. End-user guide: `USER_GUIDE.md`.

## Local setup

```bash
npm install
cp .env.example .env.local        # then fill the values, see SETUP_KEYS.md
npm run db:migrate                # creates the tables in your Neon database
npm run dev                       # http://localhost:3000
```

Without `BLOB_READ_WRITE_TOKEN`, uploads fall back to a gitignored `.local-uploads/` folder. This fallback is **disabled in production**.

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Run, build, serve |
| `npm run typecheck`, `npm run lint`, `npm test` | Quality gates (tests use mocked providers, no keys needed) |
| `npm run db:generate` | Regenerate SQL after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run samples` | Regenerate the sample SOPs in `eval/sops/` |
| `npm run smoke` | End-to-end check against a running server: register, upload, text question, voice transcription |
| `npm run eval` | Offline evaluation (language detection, BM25 hit rate); add `-- --online [--judge]` for full answer scoring. Writes `eval/REPORT.md` |

For `eval -- --online`, start the server with `LIMIT_LLM_PER_MIN=60` so the polite per-minute limit does not slow the run.

## How it works

- **Upload:** the browser sends the file straight to Vercel Blob (private, under `u/<userId>/`, token issued only after login). The server then reads it, parses it (PDF, DOCX, XLSX/XLS, CSV, MD, TXT; scans and images go to Gemini), normalises it to Markdown with page/sheet markers, and produces the summary, outline, glossary and starter questions in one model call. Progress is saved in Postgres.
- **Questions:** documents under `FULL_CONTEXT_MAX_TOKENS` are sent whole (Mode A). Larger documents, and the Groq backup, use BM25 over heading-aware chunks (Mode B), with step-number lookup and LLM query rewriting for follow-ups and non-English questions.
- **Language:** detected automatically on every question and transcript (script analysis, romanized-Hindi lexicon, LLM tie-breaker only when ambiguous). There is no language selector.
- **Voice:** `MediaRecorder` clip (max 60 s, silence auto-stop) to Groq Whisper with language auto-detect, falling back to Gemini audio, then text. Replies are spoken with the browser `speechSynthesis` (`hi-IN` or `en-IN`), sentence by sentence, with pause, replay, speed and barge-in. Optional Gemini TTS: `TTS_ENGINE=gemini` plus `GEMINI_TTS_MODEL`.
- **Free-tier survival:** per-user and global quota counters in Postgres, provider fallback with one retry, friendly "busy" messages.
- **Health:** `GET /api/health` shows which providers are configured (never the keys).

## Deploying to Vercel

Nothing here deploys automatically. Do these steps yourself when the keys are ready.

1. **Check the free limits.** In the Gemini (AI Studio) and Groq consoles, confirm the current free-tier models and limits, then choose `GEMINI_MODEL` and `GROQ_LLM_MODEL`. Free tiers change often.
2. **Push to GitHub.** `.env.local` is already git-ignored. Create an empty GitHub repository, then `git remote add origin <url>` and `git push -u origin main` (rename the branch first if needed).
3. **Create the Vercel project** from that repository (framework: Next.js, defaults are fine).
4. **Create the Neon database** in the Vercel dashboard: *Storage > Marketplace > Neon > Free plan*, and connect it to the project. This adds `DATABASE_URL`.
5. **Create a Blob store:** *Storage > Blob*, connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`. The app stores uploads as **private** blobs; if the store offers an access setting, choose private.
6. **Add the remaining environment variables** (Project Settings > Environment Variables, Production): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_LLM_MODEL`, `GROQ_STT_MODEL` (default `whisper-large-v3-turbo`), `JWT_SECRET` (long random string), `PRIVACY_NOTICE`, `APP_NAME`, `COMPANY_NAME`, optionally `CRON_SECRET` and `RETENTION_DAYS` (daily purge job in `vercel.json`), and the `LIMIT_*` values. The app refuses to start in production if `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, a real `JWT_SECRET`, or at least one LLM is missing.
7. **Run migrations** once, from your machine, against the Neon database: `vercel env pull .env.local` (or paste the `DATABASE_URL` into `.env.local`), then `npm run db:migrate`. Run it again after any schema change.
8. **Deploy** (push to the main branch, or *Deployments > Redeploy*).
9. **Smoke test:** open `https://<your-app>.vercel.app/api/health` and confirm providers show as configured. Then `BASE_URL=https://<your-app>.vercel.app npm run smoke` (needs `BLOB_READ_WRITE_TOKEN` in your local `.env.local`), and finally try the app by hand: register, upload `eval/sops/expense-sop.pdf`, ask by text, ask by voice (browser mic permission required, HTTPS is provided by Vercel).

**Important limits:** functions are stateless; each request is designed to finish within 60 s; request bodies to functions are capped at 4.5 MB (hence direct-to-Blob uploads and the 4 MB / 60 s voice clip cap). **Vercel's free Hobby plan is for personal, non-commercial use only.** If a company will use this app for real work, move to a paid Vercel plan or another host before launch. Free Gemini and Groq tiers may use submitted text to improve their products: use only non-confidential or sample SOPs until you move to paid or private tiers.

## Project layout

```
app/            pages (auth, app) and API route handlers
components/     UploadZone, Stepper, SummaryCard, ChatPanel, MicButton, AudioPlayer, SourcePanel, AppShell
lib/            db, auth, quota, llm (gemini, groq, router), ingestion, retrieval, language, voice, prompts, chat
tests/          vitest unit tests (mocked providers)
eval/           sample SOPs, labelled questions, audio sample, evaluation runner
scripts/        migrate and smoke
drizzle/        generated SQL migrations
```

## Known limitations

See the end of `PROGRESS.md` and the final build summary. In short: no embeddings (BM25 only), no dark mode, no live captions, Hindi speech needs a Hindi voice on the device, and free-tier quotas apply.
