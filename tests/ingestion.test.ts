import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell } from "docx";
import { validateUpload, sanitizeFilename, sniffMatches, kindOf } from "@/lib/ingestion/files";
import { parseBuffer, rowsToMarkdown } from "@/lib/ingestion/parsers";
import { normalizeText, buildOutline, estimateTokens, detectDocLanguage, looksLikeHeading } from "@/lib/ingestion/normalizer";
import { chunkDocument } from "@/lib/ingestion/chunker";
import { htmlToMarkdown } from "@/lib/ingestion/html";
import { extractJson, fitToTokens } from "@/lib/ingestion/summarizer";
import { withFallback } from "@/lib/llm/router";
import { ProviderError, AllProvidersFailedError, type LLMProvider } from "@/lib/llm/base";
import { geminiBody, geminiText } from "@/lib/llm/gemini";
import { groqBody } from "@/lib/llm/groq";
import { summarySchema } from "@/lib/prompts/summary";

describe("file validation", () => {
  it("accepts supported types and rejects others with friendly messages", () => {
    expect(validateUpload("a.pdf", 1000, "application/pdf", 10)).toBeNull();
    expect(validateUpload("a.csv", 1000, "application/vnd.ms-excel", 10)).toBeNull();
    expect(validateUpload("a.md", 1000, "", 10)).toBeNull();
    expect(validateUpload("a.doc", 1000, "", 10)).toMatch(/DOCX/);
    expect(validateUpload("a.exe", 1000, "", 10)).toMatch(/not supported/);
    expect(validateUpload("a.pdf", 11 * 1024 * 1024, "", 10)).toMatch(/10 MB/);
    expect(validateUpload("a.pdf", 10, "text/html", 10)).toMatch(/does not match/);
    expect(validateUpload("a.pdf", 0, "", 10)).toMatch(/empty/);
  });
  it("sanitizes filenames and sniffs magic bytes", () => {
    expect(sanitizeFilename("../../etc/pass wd.pdf")).toBe("pass wd.pdf");
    expect(sanitizeFilename("a<b>|c.txt")).toBe("a_b_c.txt");
    expect(sniffMatches("pdf", Buffer.from("%PDF-1.7"))).toBe(true);
    expect(sniffMatches("pdf", Buffer.from("MZ binary"))).toBe(false);
    expect(sniffMatches("txt", Buffer.from([1, 0, 2]))).toBe(false);
    expect(kindOf("X.XLSX")).toBe("xlsx");
  });
});

describe("parsers", () => {
  it("parses CSV into a markdown table with a sheet heading", async () => {
    const r = await parseBuffer(Buffer.from("Role,Owner\nApprover,HR\nRequester,Employee\n"), "csv", "roles.csv");
    expect(r.text).toContain("## Sheet: roles");
    expect(r.text).toContain("| Approver | HR |");
  });
  it("parses XLSX with multiple sheets", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item", "Limit"], ["Laptop", "50000"]]), "Limits");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"], ["B"]]), "Other");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const r = await parseBuffer(buf, "xlsx");
    expect(r.text).toContain("## Sheet: Limits");
    expect(r.text).toContain("| Laptop | 50000 |");
    expect(r.text).toContain("## Sheet: Other");
  });
  it("parses DOCX headings, steps and tables, including Hindi", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "छुट्टी नीति", heading: HeadingLevel.HEADING_1 }),
            new Paragraph("Employees must apply in advance."),
            new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Type")] }), new TableCell({ children: [new Paragraph("Days")] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph("Casual")] }), new TableCell({ children: [new Paragraph("12")] })] })] }),
          ],
        },
      ],
    });
    const r = await parseBuffer(await Packer.toBuffer(doc), "docx");
    expect(r.text).toContain("# छुट्टी नीति");
    expect(r.text).toContain("| Casual | 12 |");
  });
  it("passes MD/TXT through and flags images for vision", async () => {
    expect((await parseBuffer(Buffer.from("﻿# Hi"), "md")).text).toBe("# Hi");
    expect((await parseBuffer(Buffer.from([0x89]), "image")).needsVision).toBe(true);
  });
  it("escapes pipes in cells", () => {
    expect(rowsToMarkdown([["a|b", "c"], ["1", "2"]])).toContain("a\\|b");
  });
});

describe("html to markdown", () => {
  it("converts structure", () => {
    const md = htmlToMarkdown("<h2>Scope</h2><p>Hello <strong>world</strong></p><ol><li>One</li><li>Two</li></ol>");
    expect(md).toBe("## Scope\n\nHello **world**\n\n1. One\n2. Two");
  });
});

describe("normalizer", () => {
  it("cleans whitespace and control characters", () => {
    expect(normalizeText("a\r\n\r\n\r\n\r\nb\u0000  \n")).toBe("a\n\nb");
  });
  it("promotes heading-like lines in unstructured text and builds an outline with pages", () => {
    const raw = "## Page 1\n\nPURPOSE\nThis explains leave.\n\n5. Procedure\n5.1 Apply Online\n1. Open the portal and click Leave.\n\n## Page 2\n\n6. Records\nKeep records.";
    const t = normalizeText(raw, "pdf");
    const outline = buildOutline(t);
    expect(outline.map((o) => o.title)).toEqual(["PURPOSE", "5. Procedure", "5.1 Apply Online", "6. Records"]);
    expect(outline[2].path).toBe("5. Procedure > 5.1 Apply Online");
    expect(outline[3].page).toBe("2");
    expect(looksLikeHeading("1. Open the portal and click Leave.")).toBeNull();
  });
  it("estimates tokens and language", () => {
    expect(estimateTokens("abcd".repeat(100))).toBe(100);
    expect(detectDocLanguage("यह एक दस्तावेज़ है")).toBe("hi");
    expect(detectDocLanguage("This is a document")).toBe("en");
    expect(detectDocLanguage("This is a document with एक थोड़ा हिंदी text mixed in here today")).toBe("mixed");
  });
});

describe("chunker", () => {
  const step = (n: number) => `${n}. Do the thing number ${n} carefully and record the outcome in the register.`;
  it("keeps a procedure together, tracks sections, pages and step numbers", () => {
    const text = ["## Page 3", "# Leave Policy", "## Applying", [1, 2, 3, 4, 5].map(step).join("\n"), "## Approval", "Manager approves within 2 days."].join("\n\n");
    const chunks = chunkDocument(text, { minTokens: 5 });
    const proc = chunks.find((c) => c.chunkType === "procedure")!;
    expect(proc.text).toContain("5. Do the thing");
    expect(proc.text).toContain("1. Do the thing");
    expect(proc.sectionPath).toBe("Leave Policy > Applying");
    expect(proc.page).toBe("3");
    expect(proc.stepNo).toBe(1);
    expect(chunks.some((c) => c.sectionPath === "Leave Policy > Approval")).toBe(true);
  });
  it("splits oversized content within the limit and repeats table headers", () => {
    const rows = Array.from({ length: 400 }, (_, i) => `| item${i} | value${i} | note about the row ${i} |`);
    const text = ["# Data", "| A | B | C |", "| --- | --- | --- |", ...rows].join("\n");
    const chunks = chunkDocument(text, { maxTokens: 300 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(330);
    expect(chunks[1].text).toContain("| A | B | C |");
    expect(chunks.every((c) => c.chunkType === "table" || c.chunkType === "text")).toBe(true);
  });
  it("returns no chunks for empty text", () => {
    expect(chunkDocument("")).toEqual([]);
  });
});

describe("summarizer helpers", () => {
  it("extracts JSON from fenced or noisy output", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} done')).toEqual({ a: 2 });
    expect(extractJson("nope")).toBeNull();
  });
  it("trims long documents keeping head and tail", () => {
    const long = "x".repeat(10000) + "END";
    const t = fitToTokens(long, 500);
    expect(t.length).toBeLessThan(2000);
    expect(t.endsWith("END")).toBe(true);
  });
  it("coerces sloppy summary JSON", () => {
    const s = summarySchema.parse({ title: "T", roles: "not a list", glossary: [{ term: "SOP", definition: 3 }, { bad: 1 }] });
    expect(s.roles).toEqual([]);
    expect(s.glossary).toEqual([{ term: "SOP", definition: "" }]);
    expect(s.starter_questions).toEqual([]);
  });
});

function fake(name: string, behaviour: (n: number) => string | ProviderError): LLMProvider & { calls: number } {
  const p = {
    name,
    supportsFiles: name === "gemini",
    mode: name === "gemini" ? ("full" as const) : ("retrieval" as const),
    calls: 0,
    async generate() {
      const r = behaviour(p.calls++);
      if (r instanceof Error) throw r;
      return r;
    },
    async *stream() {
      yield await p.generate();
    },
  };
  return p;
}

describe("provider fallback", () => {
  const sleep = async () => {};
  it("retries once on 429 and then succeeds on the same provider", async () => {
    const g = fake("gemini", (n) => (n === 0 ? new ProviderError("rate", "gemini", 429) : "ok"));
    const r = await withFallback([g], (p) => p.generate({ messages: [] }), { sleep });
    expect(r.value).toBe("ok");
    expect(g.calls).toBe(2);
  });
  it("falls over to the next provider after a retry fails", async () => {
    const g = fake("gemini", () => new ProviderError("down", "gemini", 503));
    const q = fake("groq", () => "backup");
    const seen: boolean[] = [];
    const r = await withFallback([g, q], async (p, info) => {
      seen.push(info.isRetry);
      return p.generate({ messages: [] });
    }, { sleep });
    expect(r.provider.name).toBe("groq");
    expect(g.calls).toBe(2);
    expect(seen).toEqual([false, true, true]);
  });
  it("does not retry non-retryable errors but still tries the next provider", async () => {
    const g = fake("gemini", () => new ProviderError("bad key", "gemini", 401));
    const q = fake("groq", () => "ok");
    const r = await withFallback([g, q], (p) => p.generate({ messages: [] }), { sleep });
    expect(g.calls).toBe(1);
    expect(r.value).toBe("ok");
  });
  it("throws AllProvidersFailedError flagged rate limited", async () => {
    const g = fake("gemini", () => new ProviderError("rate", "gemini", 429));
    const q = fake("groq", () => new ProviderError("rate", "groq", 429));
    const err = await withFallback([g, q], (p) => p.generate({ messages: [] }), { sleep }).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.rateLimited).toBe(true);
  });
});

describe("provider request shapes", () => {
  it("builds Gemini bodies with system prompt, json mode and files on last user turn", () => {
    const b: any = geminiBody({ system: "S", json: true, temperature: 0.1, maxTokens: 10, files: [{ mimeType: "application/pdf", data: "AAA" }], messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }, { role: "user", content: "q" }] });
    expect(b.systemInstruction.parts[0].text).toBe("S");
    expect(b.generationConfig.responseMimeType).toBe("application/json");
    expect(b.contents[1].role).toBe("model");
    expect(b.contents[2].parts[0].inlineData.data).toBe("AAA");
    expect(geminiText({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
  });
  it("builds Groq bodies", () => {
    const b: any = groqBody("m", { system: "S", json: true, messages: [{ role: "user", content: "q" }] }, true);
    expect(b.messages[0]).toEqual({ role: "system", content: "S" });
    expect(b.response_format.type).toBe("json_object");
    expect(b.stream).toBe(true);
  });
});
