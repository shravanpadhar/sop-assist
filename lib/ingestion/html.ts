/** Minimal HTML (as produced by mammoth) to Markdown converter: headings, lists, tables, emphasis. */

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => ENT[m] ?? m).replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));

function inline(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<(strong|b)>(.*?)<\/\1>/gis, "**$2**")
      .replace(/<(em|i)>(.*?)<\/\1>/gis, "*$2*")
      .replace(/<a [^>]*>(.*?)<\/a>/gis, "$1")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tableToMd(html: string): string {
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gis)].map((c) => inline(c[1]).replace(/\|/g, "\\|")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
  return [pad(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad)].join("\n");
}

export function htmlToMarkdown(html: string): string {
  const out: string[] = [];
  const re = /<(h[1-6]|p|ol|ul|table)\b[^>]*>(.*?)<\/\1>/gis;
  for (const m of html.matchAll(re)) {
    const tag = m[1].toLowerCase();
    const body = m[2];
    if (tag[0] === "h") out.push(`${"#".repeat(Number(tag[1]))} ${inline(body)}`);
    else if (tag === "p") {
      const t = inline(body);
      if (t) out.push(t);
    } else if (tag === "table") out.push(tableToMd(body));
    else {
      let n = 0;
      const items = [...body.matchAll(/<li[^>]*>(.*?)<\/li>/gis)].map((li) => {
        n++;
        return `${tag === "ol" ? `${n}.` : "-"} ${inline(li[1])}`;
      });
      out.push(items.join("\n"));
    }
  }
  return out.filter(Boolean).join("\n\n");
}
