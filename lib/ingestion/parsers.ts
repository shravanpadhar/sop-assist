import type { FileKind } from "./files";
import { htmlToMarkdown } from "./html";

export interface ParseResult {
  text: string;
  /** True when no usable text was found (scan / image) and a vision model should read the file. */
  needsVision: boolean;
  pages?: number;
}

const MAX_SHEET_ROWS = 5000;

function mdCell(v: unknown) {
  return String(v ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

export function rowsToMarkdown(rows: unknown[][]): string {
  const clean = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (!clean.length) return "";
  const width = Math.max(...clean.map((r) => r.length));
  const line = (r: unknown[]) => `| ${Array.from({ length: width }, (_, i) => mdCell(r[i])).join(" | ")} |`;
  return [line(clean[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...clean.slice(1, MAX_SHEET_ROWS).map(line)].join("\n");
}

async function parsePdf(buf: Buffer): Promise<ParseResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  const body = pages.map((p, i) => `## Page ${i + 1}\n\n${p.trim()}`).join("\n\n");
  const chars = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
  // Fewer than ~40 real characters per page on average means the PDF is a scan.
  const scanned = chars < 40 * Math.max(1, totalPages);
  return { text: body, needsVision: scanned, pages: totalPages };
}

async function parseDocx(buf: Buffer): Promise<ParseResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  const text = htmlToMarkdown(value);
  return { text, needsVision: false };
}

async function parseSheet(buf: Buffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
    const md = rowsToMarkdown(rows);
    if (md) parts.push(`## Sheet: ${name}\n\n${md}`);
  }
  return { text: parts.join("\n\n"), needsVision: false, pages: wb.SheetNames.length };
}

async function parseCsv(buf: Buffer, filename: string): Promise<ParseResult> {
  const Papa = (await import("papaparse")).default;
  const res = Papa.parse<string[]>(buf.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true });
  const name = filename.replace(/\.csv$/i, "");
  return { text: `## Sheet: ${name}\n\n${rowsToMarkdown(res.data)}`, needsVision: false };
}

export async function parseBuffer(buf: Buffer, kind: FileKind, filename = "data.csv"): Promise<ParseResult> {
  switch (kind) {
    case "pdf":
      return parsePdf(buf);
    case "docx":
      return parseDocx(buf);
    case "xlsx":
    case "xls":
      return parseSheet(buf);
    case "csv":
      return parseCsv(buf, filename);
    case "image":
      return { text: "", needsVision: true };
    case "md":
    case "txt":
      return { text: buf.toString("utf8").replace(/^﻿/, ""), needsVision: false };
  }
}
