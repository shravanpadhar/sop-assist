/**
 * Evaluation runner.
 *   npm run eval                 offline checks only (language detector + BM25 retrieval hit rate), no keys needed
 *   npm run eval -- --online     also asks every question through a running server (needs keys, DB)
 *   npm run eval -- --online --judge   also uses the configured LLM as a judge of answer correctness
 * Writes eval/REPORT.md. For --online set LIMIT_LLM_PER_MIN=60 on the server to avoid the polite 429s.
 */
import fs from "node:fs";
import path from "node:path";
import { Client, BASE, serverUp } from "../scripts/lib/client";
import { detectLanguage } from "../lib/language/detector";
import { parseBuffer } from "../lib/ingestion/parsers";
import { kindOf } from "../lib/ingestion/files";
import { normalizeText } from "../lib/ingestion/normalizer";
import { chunkDocument } from "../lib/ingestion/chunker";
import { selectChunks } from "../lib/retrieval/bm25";
import { createProviders, generateWithFallback } from "../lib/llm/router";
import { extractJson } from "../lib/ingestion/summarizer";

interface Q {
  sop: string;
  q: string;
  lang: "en" | "hi" | "hinglish";
  expect?: string[];
  forbid?: string[];
  notInDocument?: boolean;
  citation?: string[];
}

const here = import.meta.dirname;
const questions: Q[] = JSON.parse(fs.readFileSync(path.join(here, "questions.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}% (${a}/${b})` : "n/a");
const pctile = (xs: number[], p: number) => {
  if (!xs.length) return "n/a";
  const s = [...xs].sort((a, b) => a - b);
  return `${s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]} ms`;
};
const out: string[] = [`# SOP Assist evaluation report`, ``, `Generated ${new Date().toISOString()}`, ``];

async function loadChunks(sop: string) {
  const file = path.join(here, "sops", sop);
  const kind = kindOf(sop)!;
  const parsed = await parseBuffer(fs.readFileSync(file), kind, sop);
  const text = normalizeText(parsed.text, kind);
  return chunkDocument(text).map((c) => ({ ...c }));
}

async function offline() {
  // 1. language detector on the labelled question set
  const langOk = questions.filter((x) => detectLanguage(x.q).language === x.lang).length;
  out.push(`## Offline checks`, ``, `- Language detection on the ${questions.length} labelled questions: ${pct(langOk, questions.length)}`);
  const wrong = questions.filter((x) => detectLanguage(x.q).language !== x.lang);
  if (wrong.length) out.push(`  - misclassified: ${wrong.map((w) => `"${w.q}" (expected ${w.lang}, got ${detectLanguage(w.q).language})`).join("; ")}`);

  // 2. BM25 retrieval hit rate: do the top chunks contain all expected keywords?
  const cache = new Map<string, Awaited<ReturnType<typeof loadChunks>>>();
  const byLang: Record<string, { hit: number; n: number }> = {};
  let hit = 0;
  let n = 0;
  for (const x of questions.filter((q) => q.expect?.length)) {
    if (!cache.has(x.sop)) cache.set(x.sop, await loadChunks(x.sop));
    const chunks = cache.get(x.sop)!;
    const picked = selectChunks(chunks, x.q, { maxTokens: 6000, question: x.q });
    const joined = picked.map((c) => c.text).join("\n");
    const ok = x.expect!.every((e) => has(joined, e));
    n++;
    hit += ok ? 1 : 0;
    (byLang[x.lang] ??= { hit: 0, n: 0 }).n++;
    if (ok) byLang[x.lang].hit++;
    else out.push(`  - retrieval miss: "${x.q}" (${x.sop})`);
  }
  out.push(`- BM25 retrieval hit rate (Mode B, raw question, no LLM rewrite): ${pct(hit, n)}`);
  for (const [l, v] of Object.entries(byLang)) out.push(`  - ${l}: ${pct(v.hit, v.n)}`);
  out.push(`  - Note: cross-language questions (for example Hindi on an English SOP) rely on the LLM query rewrite in production, so a lower raw hit rate here is expected.`, ``);
  console.log(out.join("\n"));
}

async function online() {
  const health = await serverUp();
  if (!health) {
    out.push(`## Online checks`, ``, `Skipped: no server reachable at ${BASE}.`);
    return;
  }
  const c = new Client();
  const reg = await c.register(`eval+${Date.now()}@example.test`, "Eval-pass-12345");
  if (!reg.ok) {
    out.push(`## Online checks`, ``, `Skipped: could not register (${reg.body.error}).`);
    return;
  }
  const docs = new Map<string, string>();
  for (const sop of new Set(questions.map((q) => q.sop))) {
    const r = await c.uploadAndIngest(path.join(here, "sops", sop));
    if (!r.ok) throw new Error(`Ingestion of ${sop} failed: ${r.body.error}`);
    docs.set(sop, r.body.id);
  }
  const judgeProviders = args.has("--judge") ? createProviders() : [];

  let answered = 0, correct = 0, langOk = 0, citeN = 0, citeOk = 0, notInN = 0, notInOk = 0, injected = 0, injectedOk = 0, judged = 0, judgeOk = 0;
  const first: number[] = [];
  const total: number[] = [];
  const failures: string[] = [];
  const conv = new Map<string, string>();

  for (const x of questions) {
    let r = await c.chat(docs.get(x.sop)!, x.q, conv.get(x.sop));
    if (!r.ok && r.status === 429) {
      await new Promise((s) => setTimeout(s, 61000)); // per-minute quota: wait and retry once
      r = await c.chat(docs.get(x.sop)!, x.q, conv.get(x.sop));
    }
    if (!r.ok) {
      failures.push(`"${x.q}": ${"error" in r ? r.error : "failed"}`);
      continue;
    }
    conv.set(x.sop, r.meta.conversationId);
    answered++;
    const a = r.final.answer;
    if (r.firstDeltaMs !== null) first.push(r.firstDeltaMs);
    total.push(r.totalMs);
    if (a.language === x.lang) langOk++;
    let ok = true;
    if (x.notInDocument) {
      notInN++;
      ok = a.found_in_document === false;
      if (ok) notInOk++;
    } else {
      ok = (x.expect ?? []).every((e) => has(a.answer_text, e)) && !(x.forbid ?? []).some((f) => has(a.answer_text, f));
      if (x.citation) {
        citeN++;
        const cites = JSON.stringify(a.citations ?? []);
        if (x.citation.some((s) => has(cites, s))) citeOk++;
      }
    }
    if (x.forbid) {
      injected++;
      if (!x.forbid.some((f) => has(a.answer_text, f))) injectedOk++;
    }
    if (judgeProviders.length) {
      try {
        const { text } = await generateWithFallback(judgeProviders, {
          system: "You grade answers from an SOP assistant. Return JSON {\"correct\": boolean, \"reason\": string}.",
          messages: [{ role: "user", content: `Question: ${x.q}\nMust mention: ${(x.expect ?? []).join(", ") || "(the SOP does not contain the answer; the assistant should say so)"}\nAnswer: ${a.answer_text}` }],
          json: true,
          temperature: 0,
        });
        judged++;
        if ((extractJson(text) as { correct?: boolean } | null)?.correct) judgeOk++;
      } catch {
        /* judge unavailable */
      }
    }
    if (ok) correct++;
    else failures.push(`"${x.q}" -> ${a.answer_text.slice(0, 140).replace(/\n/g, " ")}`);
    await new Promise((s) => setTimeout(s, 1500));
  }

  out.push(
    `## Online checks (${BASE})`,
    ``,
    `- Questions answered: ${answered}/${questions.length}`,
    `- Answer correctness (keyword rule): ${pct(correct, answered)}`,
    judged ? `- Answer correctness (LLM judge): ${pct(judgeOk, judged)}. Spot-check a sample manually.` : `- LLM judge: not run (add --judge)`,
    `- Language match (reply language = labelled question language): ${pct(langOk, answered)}`,
    `- Citation accuracy (where a citation is expected): ${pct(citeOk, citeN)}`,
    `- Out-of-scope questions politely declined (found_in_document=false): ${pct(notInOk, notInN)}`,
    `- Prompt injection ignored: ${pct(injectedOk, injected)}`,
    `- First streamed text: p50 ${pctile(first, 50)}, p95 ${pctile(first, 95)}`,
    `- Full answer: p50 ${pctile(total, 50)}, p95 ${pctile(total, 95)}`,
    `- Targets (spec s13): correctness >= 90%, language match >= 95%, zero invented steps, first text < 4 s, full answer < 10 s`,
    ``,
  );
  if (failures.length) out.push(`### Misses`, ``, ...failures.map((f) => `- ${f}`), ``);
  for (const id of docs.values()) await c.json("DELETE", `/api/documents/${id}`);
}

await offline();
if (args.has("--online")) await online();
fs.writeFileSync(path.join(here, "REPORT.md"), out.join("\n"));
console.log(`\nReport written to eval/REPORT.md`);
if (args.has("--online")) console.log(out.slice(out.findIndex((l) => l.startsWith("## Online"))).join("\n"));
