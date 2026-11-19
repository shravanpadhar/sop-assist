/**
 * Smoke test against a running server (npm run dev, or a deployed URL via BASE_URL).
 * Checks: health, register, upload + ingestion, a text question, a voice transcription.
 * Usage: npm run smoke
 */
import fs from "node:fs";
import path from "node:path";
import { BASE, Client, serverUp } from "./lib/client";

const results: { step: string; ok: boolean; note: string }[] = [];
function record(step: string, ok: boolean, note = "") {
  results.push({ step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${note ? `  (${note})` : ""}`);
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  const health = await serverUp();
  if (!health) {
    console.error(`Cannot reach ${BASE}/api/health. Start the app with "npm run dev" first.`);
    process.exit(2);
  }
  record("health", true, `db=${health.database} blob=${health.blob} llm=${health.llmOrder.join(">")}`);
  if (health.problems?.length) console.log("  config problems:\n   - " + health.problems.join("\n   - "));
  if (!health.database) {
    console.error("DATABASE_URL is missing; see SETUP_KEYS.md.");
    process.exit(2);
  }

  const c = new Client();
  const email = `smoke+${Date.now()}@example.test`;
  const reg = await c.register(email, "Smoke-test-pass-1");
  record("register", reg.status === 201, reg.ok ? email : reg.body.error);
  if (!reg.ok) return finish();

  const sample = path.join(import.meta.dirname, "..", "eval", "sops", "expense-sop.pdf");
  if (!fs.existsSync(sample)) {
    record("sample file", false, 'run "npm run samples" first');
    return finish();
  }
  const t0 = Date.now();
  const up = await c.uploadAndIngest(sample).catch((e) => ({ ok: false, status: 0, body: { error: String(e.message ?? e) } }));
  record("upload + ingestion", up.ok && up.body.status === "ready", up.ok ? `${Date.now() - t0} ms` : up.body.error);
  if (!up.ok) return finish();
  const docId: string = up.body.id;

  const doc = await c.json("GET", `/api/documents/${docId}`);
  record("summary and starter questions", doc.ok && !!doc.body.summary?.title && doc.body.starterQuestions.length > 0, doc.body.summary?.title);

  const chat = await c.chat(docId, "Who approves the expense claim?");
  const ans: string = chat.ok ? chat.final.answer.answer_text : "";
  record("text question", chat.ok && /manager/i.test(ans), chat.ok ? `${chat.totalMs} ms via ${chat.final.provider}, lang=${chat.final.answer.language}` : (chat.error ?? `HTTP ${chat.status}`));

  const wav = path.join(import.meta.dirname, "..", "eval", "audio", "question-en.wav");
  if (!fs.existsSync(wav)) record("voice transcription", false, "eval/audio/question-en.wav missing");
  else {
    const tr = await c.transcribe(wav);
    record("voice transcription", tr.ok && typeof tr.body.text === "string" && tr.body.text.length > 3, tr.ok ? `"${tr.body.text}" via ${tr.body.engine}` : tr.body.error);
  }

  await c.json("DELETE", `/api/documents/${docId}`);
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
