import { describe, it, expect } from "vitest";
import { findCitedChunk } from "@/lib/retrieval/citation";
import { chunkDocument } from "@/lib/ingestion/chunker";
import type { StoredChunk } from "@/lib/retrieval/bm25";
import { Markdown } from "@/lib/ui/markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const text = ["## Page 1", "# Leave", "## Applying", "1. Open the portal.\n2. Pick a type.", "## Page 2", "# Travel", "## Booking", "1. Fill form TR-12.\n2. Get approval."].join("\n\n");
const chunks = chunkDocument(text, { minTokens: 1, maxTokens: 40 }) as unknown as StoredChunk[];

describe("citation lookup", () => {
  it("matches by section, page and step", () => {
    expect(findCitedChunk(chunks, { section: "Travel > Booking", page: "2", step: "1" })?.text).toContain("TR-12");
    expect(findCitedChunk(chunks, { section: "Applying", page: "", step: "2" })?.text).toContain("Pick a type");
    expect(findCitedChunk(chunks, { section: "", page: "Page 2", step: "" })?.page).toBe("2");
  });
  it("returns null when nothing matches", () => {
    expect(findCitedChunk(chunks, { section: "Nonexistent", page: "", step: "" })).toBeNull();
    expect(findCitedChunk([], { section: "x", page: "", step: "" })).toBeNull();
  });
});

describe("markdown renderer", () => {
  it("renders lists, bold and tables, and escapes HTML", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "**Steps**\n\n1. One <script>x</script>\n2. Two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |" }));
    expect(html).toContain("<strong>Steps</strong>");
    expect(html).toContain("<ol");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<td>2</td>");
  });
});
