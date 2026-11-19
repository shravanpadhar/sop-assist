/**
 * Incrementally extracts the decoded value of the "answer_text" string from a streaming JSON object,
 * so the UI can show the answer while the model is still writing the rest of the JSON.
 */
export class AnswerTextExtractor {
  private buf = "";
  private pos = -1; // index of next unread char inside the string value; -1 until the key is found
  private done = false;

  push(chunk: string): string {
    if (this.done) return "";
    this.buf += chunk;
    if (this.pos < 0) {
      const m = /"answer_text"\s*:\s*"/.exec(this.buf);
      if (!m) return "";
      this.pos = m.index + m[0].length;
    }
    let out = "";
    while (this.pos < this.buf.length) {
      const ch = this.buf[this.pos];
      if (ch === '"') {
        this.done = true;
        break;
      }
      if (ch !== "\\") {
        out += ch;
        this.pos++;
        continue;
      }
      const next = this.buf[this.pos + 1];
      if (next === undefined) break; // wait for more
      if (next === "u") {
        const hex = this.buf.slice(this.pos + 2, this.pos + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 0);
        this.pos += 6;
        continue;
      }
      const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
      out += map[next] ?? next;
      this.pos += 2;
    }
    return out;
  }
}
