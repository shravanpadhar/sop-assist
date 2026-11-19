/** Tiny HTTP client for the smoke test and evaluation scripts (cookie jar, NDJSON chat, uploads). */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { put } from "@vercel/blob";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class Client {
  cookie = "";

  async req(method: string, url: string, body?: BodyInit | null, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + url, { method, body, headers: { ...headers, ...(this.cookie ? { cookie: this.cookie } : {}) } });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) this.cookie = set.map((c) => c.split(";")[0]).join("; ");
    return res;
  }

  async json(method: string, url: string, data?: unknown) {
    const res = await this.req(method, url, data === undefined ? null : JSON.stringify(data), data === undefined ? {} : { "Content-Type": "application/json" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body: body as any };
  }

  register(email: string, password: string) {
    return this.json("POST", "/api/auth/register", { email, password, name: "Smoke Test" });
  }

  /** Uploads a local file using whichever mode the server is in, then starts ingestion. */
  async uploadAndIngest(file: string) {
    const name = path.basename(file);
    const data = fs.readFileSync(file);
    const cfg = await this.json("GET", "/api/documents/upload-token");
    if (!cfg.ok) throw new Error(`upload-token failed: ${cfg.status}`);
    let url: string;
    if (cfg.body.mode === "local") {
      const r = await this.req("PUT", `/api/documents/dev-upload?name=${encodeURIComponent(name)}`, data);
      const j: any = await r.json();
      if (!r.ok) throw new Error(`dev-upload failed: ${j.error}`);
      url = j.url;
    } else if (cfg.body.mode === "blob") {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is needed in .env.local to upload in blob mode from this script.");
      const blob = await put(`${cfg.body.prefix}${name}`, data, { access: "private", addRandomSuffix: true, token });
      url = blob.url;
    } else throw new Error("Uploads are disabled on the server.");
    return this.json("POST", "/api/documents", { url, filename: name, size: data.length, mimeType: "" });
  }

  /** Streams /api/chat and returns the final answer plus timings. */
  async chat(documentId: string, message: string, conversationId?: string | null) {
    const t0 = Date.now();
    const res = await this.req("POST", "/api/chat", JSON.stringify({ document_id: documentId, message, conversation_id: conversationId ?? undefined }), { "Content-Type": "application/json" });
    if (!res.ok || !res.body) return { ok: false as const, status: res.status, error: ((await res.json().catch(() => ({}))) as any).error as string };
    let firstDeltaMs: number | null = null;
    let final: any = null;
    let error: string | null = null;
    let meta: any = null;
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "delta" && firstDeltaMs === null) firstDeltaMs = Date.now() - t0;
        if (ev.type === "meta") meta = ev;
        if (ev.type === "final") final = ev;
        if (ev.type === "error") error = ev.message;
      }
    }
    return { ok: !!final, status: 200, final, meta, error, firstDeltaMs, totalMs: Date.now() - t0 };
  }

  async transcribe(file: string) {
    const form = new FormData();
    form.append("audio", new Blob([fs.readFileSync(file)], { type: "audio/wav" }), "clip.wav");
    form.append("duration", "3");
    const res = await this.req("POST", "/api/voice/transcribe", form);
    return { status: res.status, ok: res.ok, body: (await res.json().catch(() => ({}))) as any };
  }
}

export async function serverUp() {
  try {
    const r = await fetch(`${BASE}/api/health`);
    return r.ok ? ((await r.json()) as any) : null;
  } catch {
    return null;
  }
}
