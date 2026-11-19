# SOP Assist: project notes for Claude Code

Spec: SOP_SPEC.md.md (v2.0). State: PLAN.md and PROGRESS.md. Current phase: 2 done; next is Phase 3 (Text Q&A).
Resume: when the user types "continue", read PROGRESS.md, then do the next unticked phase.

## Decisions
- Next.js App Router + TS + Tailwind v4 at repo root. LLM/STT via plain fetch (Gemini + Groq REST), no SDKs.
- Never hardcode model names; all come from env vars. Never print or write real keys.
- Dev-only local upload fallback (.local-uploads/) when BLOB_READ_WRITE_TOKEN is missing; disabled in production.

## Token rules
- Do not re-read SOP_SPEC.md in full again. Read only the section for the current phase.
- Use PLAN.md and PROGRESS.md as the source of truth for current state.
- Read only the files you need. No whole-repo scans, and do not re-read files you just wrote.
- Keep command output short (quiet flags, or pipe build and test output to the last 30 lines).
- Keep replies brief. No long summaries between steps.

# Compact instructions
When compacting, keep: the current phase, decisions made, files changed, and any failing test output.
