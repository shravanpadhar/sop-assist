# SETUP_KEYS: values you must add

Everything below goes in a file named **`.env.local`** in the project root (copy `.env.example` first: `cp .env.example .env.local`). Never commit this file; it is git-ignored. Never paste keys into chat, code or logs.

Check each box when done.

- [ ] **`GROQ_API_KEY`**: free, no card. Go to https://console.groq.com, sign in, open *API Keys*, create a key. Used for Whisper speech-to-text and the Llama backup.
- [ ] **`GROQ_LLM_MODEL`**: pick a Llama model that is on the free tier from https://console.groq.com/docs/models and check its limits at https://console.groq.com/docs/rate-limits. Put the exact model id in `GROQ_LLM_MODEL=`. (`GROQ_STT_MODEL` already defaults to `whisper-large-v3-turbo`; free limits there are about 20 requests/min and 7,200 audio seconds/hour.)
- [ ] **`GEMINI_API_KEY`**: free, no card. Go to https://aistudio.google.com/apikey and create a key.
- [ ] **`GEMINI_MODEL`**: choose a Flash or Flash-Lite model that is available on the free tier (list: https://ai.google.dev/gemini-api/docs/models, limits: https://ai.google.dev/gemini-api/docs/rate-limits). Put the exact model id in `GEMINI_MODEL=`. Model names are retired from time to time, so recheck if calls start failing with 404.
- [ ] **`DATABASE_URL`**: free Neon Postgres. Either create a project at https://console.neon.tech and copy the connection string (include `sslmode=require`), or add Neon from the Vercel dashboard (*Storage > Marketplace > Neon*), which creates it for you. Use the pooled connection string.
- [ ] **`JWT_SECRET`**: any long random string (at least 16 characters; the default `change-me` is rejected in production). Generate one:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- [ ] **`BLOB_READ_WRITE_TOKEN`**: optional for local development (uploads then go to `.local-uploads/`), **required on Vercel**. Create a Blob store in the Vercel dashboard (*Storage > Blob*), connect it to your project, and copy the token (or run `vercel env pull .env.local`).

Optional: `CRON_SECRET` (any random string, enables the daily retention job together with `RETENTION_DAYS`), `PRIVACY_NOTICE`, `APP_NAME`, `COMPANY_NAME`, `LIMIT_*` quotas, `TTS_ENGINE=gemini` with `GEMINI_TTS_MODEL`.

## Then run

```bash
npm run db:migrate     # creates the tables in your Neon database
npm run dev            # start the app at http://localhost:3000 (keep it running)
```

In a second terminal:

```bash
curl http://localhost:3000/api/health   # shows which keys are configured (never the keys)
npm run smoke                           # register, upload, text question, voice transcription
npm run eval -- --online --judge        # optional: full evaluation, writes eval/REPORT.md
```

If `smoke` reports a failure, `/api/health` lists the configuration problems by name.
