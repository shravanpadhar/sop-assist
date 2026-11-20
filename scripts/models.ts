/**
 * Shows which AI models your keys can use, and tests the models set in .env.local.
 * Prints model names and status codes only, never keys.   Usage: npm run models
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const gemKey = process.env.GEMINI_API_KEY;
const gemModel = process.env.GEMINI_MODEL;
const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_LLM_MODEL;

async function call(url: string, init: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: e instanceof Error ? e.message : String(e) };
  }
}

const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 220);

async function groq() {
  console.log("\n=== GROQ ===");
  if (!groqKey) return console.log("GROQ_API_KEY is empty in .env.local");
  const list = await call("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${groqKey}` } });
  if (list.status !== 200) return console.log(`Could not list models (HTTP ${list.status}): ${short(list.text)}`);
  const ids: string[] = (list.json?.data ?? []).map((m: any) => m.id).sort();
  console.log("Models your key can see (chat models, pick one for GROQ_LLM_MODEL):");
  for (const id of ids.filter((i) => !/whisper|tts|guard|embed|playai/i.test(i))) console.log("  " + id);
  console.log("Speech models:", ids.filter((i) => /whisper/i.test(i)).join(", ") || "none");
  if (groqModel) {
    const t = await call("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: "Say OK" }], max_tokens: 5 }),
    });
    console.log(`Test of GROQ_LLM_MODEL=${groqModel}: ${t.status === 200 ? "WORKS" : `FAILED (HTTP ${t.status}) ${short(t.text)}`}`);
  } else console.log("GROQ_LLM_MODEL is empty.");
}

async function gemini() {
  console.log("\n=== GEMINI ===");
  if (!gemKey) return console.log("GEMINI_API_KEY is empty in .env.local");
  const list = await call("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": gemKey } });
  if (list.status !== 200) return console.log(`Could not list models (HTTP ${list.status}): ${short(list.text)}`);
  const names: string[] = (list.json?.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: any) => String(m.name).replace(/^models\//, ""))
    .sort();
  console.log("Models that can generate text (pick a Flash or Flash-Lite one for GEMINI_MODEL):");
  for (const n of names.filter((n) => /flash|lite/i.test(n))) console.log("  " + n);
  if (gemModel) {
    const t = await call(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemModel)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gemKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }),
    });
    console.log(`Test of GEMINI_MODEL=${gemModel}: ${t.status === 200 ? "WORKS" : `FAILED (HTTP ${t.status}) ${short(t.text)}`}`);
    if (t.status === 403) console.log("  -> 403 'free tier not available': create the key in a NEW project at https://aistudio.google.com/apikey");
    if (t.status === 429) console.log("  -> 429: quota reached for this model; try a different Flash-Lite model or wait.");
  } else console.log("GEMINI_MODEL is empty.");
}

await groq();
await gemini();
console.log("\nCopy a working model name into .env.local (and into Vercel), then restart.");
