import { estimateTokens, pageMarker } from "./normalizer";

export interface Chunk {
  idx: number;
  text: string;
  sectionPath: string;
  page: string | null;
  stepNo: number | null;
  chunkType: "text" | "procedure" | "table";
  tokenCount: number;
}

export const STEP_LINE = /^\s*(?:(?:step|स्टेप|चरण)\s*)?(\d{1,3})\s*[.):\-]\s+\S/i;

interface Unit {
  text: string;
  isStep: boolean;
  stepNo: number | null;
  isTable: boolean;
}

interface Options {
  minTokens?: number;
  maxTokens?: number;
}

function toUnits(lines: string[]): Unit[] {
  const units: Unit[] = [];
  let cur: string[] = [];
  let curStep: number | null = null;
  let curTable = false;
  const flush = () => {
    if (cur.length) units.push({ text: cur.join("\n"), isStep: curStep !== null, stepNo: curStep, isTable: curTable });
    cur = [];
    curStep = null;
    curTable = false;
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const isRow = line.trim().startsWith("|");
    const stepM = STEP_LINE.exec(line);
    if (isRow !== curTable) flush();
    if (stepM && !isRow) {
      flush();
      curStep = Number(stepM[1]);
    }
    if (isRow) curTable = true;
    cur.push(line);
  }
  flush();
  return units;
}

/** Split a unit that alone exceeds the limit, repeating a table header on each piece. */
function splitBig(u: Unit, max: number): Unit[] {
  const lines = u.text.split("\n");
  const header = u.isTable ? lines.slice(0, 2) : [];
  const body = u.isTable ? lines.slice(2) : lines;
  const pieces: Unit[] = [];
  let cur: string[] = [];
  const push = () => {
    if (cur.length) pieces.push({ ...u, text: [...header, ...cur].join("\n"), stepNo: pieces.length ? null : u.stepNo });
    cur = [];
  };
  for (const l of body) {
    if (cur.length && estimateTokens([...header, ...cur, l].join("\n")) > max) push();
    // a single enormous line: cut by sentences/characters
    if (estimateTokens(l) > max) {
      push();
      const step = Math.max(200, max * 3);
      for (let i = 0; i < l.length; i += step) cur = [l.slice(i, i + step)], push();
      continue;
    }
    cur.push(l);
  }
  push();
  return pieces;
}

/** Heading-aware chunker: ~400 to 700 tokens, never splits a procedure that fits, small overlap within a section. */
export function chunkDocument(text: string, opts: Options = {}): Chunk[] {
  const minT = opts.minTokens ?? 150;
  const maxT = opts.maxTokens ?? 700;
  const out: Chunk[] = [];
  const stack: { level: number; title: string }[] = [];
  let page: string | null = null;

  let buf: Unit[] = [];
  let bufTokens = 0;
  let bufPath = "";
  let bufPage: string | null = null;
  let lastTail: Unit | null = null;

  const emit = () => {
    if (!buf.length) return;
    const body = buf.map((u) => u.text).join("\n\n");
    const steps = buf.filter((u) => u.isStep);
    out.push({
      idx: out.length,
      text: body,
      sectionPath: bufPath,
      page: bufPage,
      stepNo: steps[0]?.stepNo ?? null,
      chunkType: steps.length >= 2 ? "procedure" : buf.every((u) => u.isTable) ? "table" : "text",
      tokenCount: estimateTokens(body),
    });
    const tail = buf[buf.length - 1];
    lastTail = estimateTokens(tail.text) <= 80 && !tail.isTable ? tail : null;
    buf = [];
    bufTokens = 0;
  };

  const sectionPath = () => stack.map((s) => s.title).join(" > ");

  // Gather text per section first so that units know their section and page.
  const lines = text.split("\n");
  let sectionLines: string[] = [];
  const processSection = () => {
    if (!sectionLines.length) return;
    const units = toUnits(sectionLines).flatMap((u) => (estimateTokens(u.text) > maxT ? splitBig(u, maxT) : [u]));
    sectionLines = [];
    const path = sectionPath();
    for (const u of units) {
      const t = estimateTokens(u.text);
      if (buf.length && bufTokens + t > maxT) emit();
      if (!buf.length) {
        bufPath = path;
        bufPage = page;
        if (lastTail && lastTail !== u && out.length && out[out.length - 1].sectionPath === path) {
          buf.push(lastTail);
          bufTokens += estimateTokens(lastTail.text);
        }
        lastTail = null;
      }
      buf.push(u);
      bufTokens += t;
      bufPath = path; // a merged chunk is cited by its most specific (latest) section
    }
  };

  for (const line of lines) {
    const pm = pageMarker(line);
    if (pm) {
      processSection();
      if (buf.length) emit();
      page = pm;
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (h) {
      processSection();
      if (bufTokens >= minT) emit();
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title: h[2] });
      // keep the heading text inside the section so it is searchable
      sectionLines.push(`**${h[2]}**`);
      continue;
    }
    sectionLines.push(line);
  }
  processSection();
  emit();
  return out;
}
