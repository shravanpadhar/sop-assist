import { isHindiMarker } from "./hindiLexicon";

export type Lang = "en" | "hi" | "hinglish";

export interface Detection {
  language: Lang;
  /** False when the result is ambiguous and an LLM tie-breaker would help. */
  confident: boolean;
  reason: string;
}

export interface DetectOptions {
  /** Language of the previous turn, used for very short follow-ups. */
  previous?: Lang | null;
  /** Language reported by Whisper (supporting signal only), e.g. "hindi", "hi", "english". */
  whisperLanguage?: string | null;
}

const DEV_TOKEN = /[ऀ-ॿ]+/;
const ACRONYM = /^[A-Z0-9]{1,5}$/;

function tokenize(text: string): string[] {
  return (text.match(/[ऀ-ॿ]+|[A-Za-z][A-Za-z'’]*/g) ?? []).filter((t) => !/^[।॥]+$/.test(t));
}

export function detectLanguage(text: string, opts: DetectOptions = {}): Detection {
  const tokens = tokenize(text);
  const dev = tokens.filter((t) => DEV_TOKEN.test(t));
  const latinAll = tokens.filter((t) => !DEV_TOKEN.test(t));

  if (tokens.length === 0) {
    return { language: opts.previous ?? "en", confident: false, reason: "no letters" };
  }

  // 1. Devanagari present: compare against Latin words (all-caps acronyms such as SOP, ERP do not count).
  if (dev.length > 0) {
    const latin = latinAll.filter((t) => !ACRONYM.test(t));
    const ratio = latin.length / (dev.length + latin.length);
    if (ratio > 0.2) return { language: "hinglish", confident: ratio > 0.3, reason: `devanagari+latin ${ratio.toFixed(2)}` };
    return { language: "hi", confident: ratio < 0.12 || dev.length >= 3, reason: `devanagari ${ratio.toFixed(2)}` };
  }

  // 2. Latin only: look for romanized Hindi markers.
  const markers = latinAll.filter(isHindiMarker).length;
  const whisperHindi = /^(hi|hin|hindi|urdu|ur)$/i.test(opts.whisperLanguage ?? "");

  if (markers > 0) {
    const ratio = markers / latinAll.length;
    if (ratio >= 0.25) return { language: "hinglish", confident: true, reason: `romanized hindi ${ratio.toFixed(2)}` };
    if (whisperHindi) return { language: "hinglish", confident: true, reason: "hindi markers + whisper hindi" };
    return { language: "en", confident: false, reason: `few hindi markers ${ratio.toFixed(2)}` };
  }

  // 3. No markers. Very short follow-ups inherit the previous language (unless it was Devanagari Hindi).
  if (latinAll.length <= 3 && opts.previous && opts.previous !== "hi") {
    return { language: opts.previous, confident: true, reason: "short follow-up inherits previous" };
  }
  if (whisperHindi && latinAll.length >= 1) return { language: "hinglish", confident: false, reason: "whisper hindi, no markers" };
  return { language: "en", confident: true, reason: "english" };
}

export type Classifier = (text: string) => Promise<Lang | null>;

/** Rule-based detection with an optional LLM tie-breaker for ambiguous input. Never throws. */
export async function resolveLanguage(text: string, opts: DetectOptions & { classify?: Classifier } = {}): Promise<Detection> {
  const d = detectLanguage(text, opts);
  if (d.confident || !opts.classify) return d;
  try {
    const llm = await opts.classify(text);
    if (llm) return { language: llm, confident: true, reason: `llm tie-breaker (rules said ${d.language})` };
  } catch {
    /* fall back to the rule-based answer */
  }
  return d;
}

export function parseClassification(raw: string): Lang | null {
  const m = /"language"\s*:\s*"(en|hi|hinglish)"/i.exec(raw);
  if (m) return m[1].toLowerCase() as Lang;
  const bare = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  return bare === "en" || bare === "hi" || bare === "hinglish" ? bare : null;
}

/** Locale used for browser speech synthesis. */
export function speechLocale(language: Lang, hinglishSpeech: boolean): "hi-IN" | "en-IN" {
  if (language === "hi") return "hi-IN";
  if (language === "hinglish" && hinglishSpeech) return "hi-IN";
  return "en-IN";
}
