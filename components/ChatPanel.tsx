"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/lib/ui/markdown";
import { useSettings } from "@/lib/ui/settings";
import { useToast } from "./Toast";
import { AudioPlayer } from "./AudioPlayer";
import { MicButton, Waveform, type MicState } from "./MicButton";
import { ConfirmDialog } from "./ConfirmDialog";
import { SummaryCard, type SummaryData } from "./SummaryCard";
import type { CitationRef } from "./SourcePanel";
import { CopyIcon, DownloadIcon, SendIcon, SettingsIcon, ThumbDownIcon, ThumbUpIcon, TrashIcon } from "./icons";
import { Speaker, type SpeakerState } from "@/lib/voice/tts";
import { MicError, MAX_RECORD_SECONDS, VoiceRecorder, recorderSupported } from "@/lib/voice/recorder";
import { TranscribeError, transcribeClip } from "@/lib/voice/client";
import { speechLocale, type Lang } from "@/lib/language/detector";

interface Msg {
  id: string;
  serverId?: string;
  role: "user" | "assistant";
  text: string;
  speechText?: string;
  language?: Lang | null;
  citations?: CitationRef[];
  found?: boolean | null;
  viaVoice?: boolean;
  streaming?: boolean;
  error?: string;
  retryText?: string;
  rating?: 1 | -1;
}

const BADGE: Record<Lang, { label: string; title: string }> = {
  en: { label: "EN", title: "Answered in English" },
  hi: { label: "हिं", title: "Answered in Hindi" },
  hinglish: { label: "HI-EN", title: "Answered in Hinglish" },
};

const plain = (s: string) => s.replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
let counter = 0;
const uid = () => `m${Date.now()}-${counter++}`;

async function* readNdjson(res: Response): AsyncGenerator<Record<string, any>> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
}

export function ChatPanel({ documentId, filename, summary, starters, ttsEngine, hinglishSpeech, onCite }: { documentId: string; filename: string; summary: SummaryData | null; starters: string[]; ttsEngine: "browser" | "gemini"; hinglishSpeech: boolean; onCite: (c: CitationRef) => void }) {
  const toast = useToast();
  const [settings, setSettings] = useSettings();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [wave, setWave] = useState<number[]>([]);
  const [secs, setSecs] = useState(0);
  const [micError, setMicError] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speakerState, setSpeakerState] = useState<SpeakerState>("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [micSupported, setMicSupported] = useState(true);

  const speaker = useRef<Speaker | null>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convRef = useRef<string | null>(null);
  const lastLang = useRef<Lang | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    speaker.current = new Speaker({ engine: ttsEngine, onState: setSpeakerState, onNoVoice: () => toast("No voice for this language is installed on this device. The text answer is shown instead.") });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMicSupported(recorderSupported());
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
    const s = speaker.current;
    return () => {
      s?.stop();
      recorder.current?.cancel();
    };
  }, [ttsEngine, toast]);

  // Load the latest conversation for this document.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations?document_id=${documentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setConversationId(d.conversationId);
        convRef.current = d.conversationId;
        setMessages(
          (d.messages as any[]).map((m) => ({ id: m.id, serverId: m.id, role: m.role, text: m.text, speechText: m.speechText ?? undefined, language: m.language, citations: m.citations ?? [], found: m.foundInDocument })),
        );
        const last = [...d.messages].reverse().find((m: any) => m.role === "user");
        lastLang.current = (last?.language as Lang) ?? null;
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const speak = useCallback(
    (m: Msg) => {
      const text = m.speechText || plain(m.text);
      setSpeakingId(m.id);
      void speaker.current?.speak(text, speechLocale(m.language ?? "en", hinglishSpeech), settingsRef.current.rate);
    },
    [hinglishSpeech],
  );

  const send = useCallback(
    async (raw: string, opts: { viaVoice?: boolean; whisper?: string | null } = {}) => {
      const text = raw.trim();
      if (!text || sending) return;
      speaker.current?.stop();
      setSpeakingId(null);
      const userMsg: Msg = { id: uid(), role: "user", text, viaVoice: opts.viaVoice };
      const botId = uid();
      setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", text: "", streaming: true }]);
      setInput("");
      setSending(true);
      const patch = (p: Partial<Msg>) => setMessages((all) => all.map((x) => (x.id === botId ? { ...x, ...p } : x)));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId, message: text, conversation_id: convRef.current, whisper_language: opts.whisper ?? undefined }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          patch({ streaming: false, error: d.error ?? "Something went wrong. Please try again.", retryText: text });
          return;
        }
        let acc = "";
        for await (const ev of readNdjson(res)) {
          if (ev.type === "meta") {
            convRef.current = ev.conversationId;
            setConversationId(ev.conversationId);
            lastLang.current = ev.language;
            patch({ language: ev.language });
          } else if (ev.type === "delta") {
            acc += ev.text;
            patch({ text: acc });
          } else if (ev.type === "reset") {
            acc = "";
            patch({ text: "" });
          } else if (ev.type === "final") {
            const a = ev.answer;
            const finalMsg: Msg = { id: botId, serverId: ev.messageId, role: "assistant", text: a.answer_text, speechText: a.speech_text, language: a.language, citations: a.citations, found: a.found_in_document };
            patch({ ...finalMsg, streaming: false });
            const s = settingsRef.current;
            if (s.autoSpeak === "always" || (s.autoSpeak === "voice" && opts.viaVoice)) speak(finalMsg);
          } else if (ev.type === "error") {
            patch({ streaming: false, error: ev.message, retryText: text });
          }
        }
        patch({ streaming: false });
      } catch {
        patch({ streaming: false, error: "Network problem. Check your connection and try again.", retryText: text });
      } finally {
        setSending(false);
      }
    },
    [documentId, sending, speak],
  );

  async function toggleMic() {
    if (micState === "listening") {
      recorder.current?.stop("manual");
      return;
    }
    speaker.current?.stop(); // barge-in: stop speaking immediately
    setSpeakingId(null);
    setMicError("");
    const rec = new VoiceRecorder(
      {
        onLevel: (_l, w) => setWave(w),
        onTick: setSecs,
        onStop: async (result, reason) => {
          recorder.current = null;
          if (!result) {
            setMicState("idle");
            if (reason === "no-speech") toast("I did not hear anything. Tap the mic and try again.");
            return;
          }
          setMicState("processing");
          try {
            const t = await transcribeClip(result.blob, result.seconds, lastLang.current);
            setMicState("idle");
            await send(t.text, { viaVoice: true, whisper: t.whisper_language });
          } catch (e) {
            setMicState("idle");
            toast(e instanceof Error ? e.message : "Voice input failed.", "error");
            if (e instanceof TranscribeError && e.fallbackToText) inputRef.current?.focus();
          }
        },
      },
      { handsFree: settingsRef.current.handsFree },
    );
    try {
      await rec.start();
      recorder.current = rec;
      setSecs(0);
      setWave([]);
      setMicState("listening");
    } catch (e) {
      setMicState("idle");
      setMicError(e instanceof MicError ? e.message : "Could not start the microphone.");
    }
  }

  async function clearConversation() {
    setConfirmClear(false);
    if (conversationId) {
      const r = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (!r.ok) return toast("Could not clear the conversation.", "error");
    }
    speaker.current?.stop();
    setMessages([]);
    setConversationId(null);
    convRef.current = null;
    lastLang.current = null;
    toast("Conversation cleared.");
  }

  async function rate(m: Msg, rating: 1 | -1) {
    if (!m.serverId) return;
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, rating } : x)));
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: m.serverId, rating }) });
    if (!r.ok) toast("Could not save feedback.", "error");
  }

  function exportChat() {
    const body = messages.map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${m.text}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([`Chat about ${filename}\n\n${body}\n`], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${filename.replace(/\.[^.]+$/, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const listening = micState === "listening";
  const iconBtn = "rounded p-1.5 text-navy hover:bg-slate-100";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
        <details className="relative">
          <summary className={`${iconBtn} cursor-pointer list-none`} aria-label="Settings">
            <SettingsIcon className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
            <label className="block">
              Read answers aloud
              <select value={settings.autoSpeak} onChange={(e) => setSettings({ autoSpeak: e.target.value as typeof settings.autoSpeak })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1">
                <option value="voice">Only for voice questions</option>
                <option value="always">Always</option>
                <option value="never">Never</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.handsFree} onChange={(e) => setSettings({ handsFree: e.target.checked })} />
              Stop recording after a pause
            </label>
            <label className="block">
              Speech speed
              <select value={settings.rate} onChange={(e) => { const r = Number(e.target.value); setSettings({ rate: r }); speaker.current?.setRate(r); }} className="mt-1 w-full rounded border border-slate-300 px-2 py-1">
                {[0.75, 1, 1.25, 1.5].map((r) => (
                  <option key={r} value={r}>{r}x</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <button onClick={exportChat} disabled={!messages.length} className={`${iconBtn} disabled:opacity-40`} aria-label="Export chat as text" title="Export chat">
          <DownloadIcon className="h-4 w-4" />
        </button>
        <button onClick={() => setConfirmClear(true)} disabled={!messages.length} className={`${iconBtn} disabled:opacity-40`} aria-label="Clear conversation" title="Clear conversation">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6" role="log" aria-live="polite" aria-label="Conversation">
        <div className="mx-auto max-w-3xl space-y-4">
          <SummaryCard summary={summary} filename={filename} starters={starters} onAsk={(q) => send(q)} disabled={sending} />
          {!loaded && <div className="h-16 animate-pulse rounded-xl bg-slate-200" aria-busy="true" />}
          {loaded && messages.length === 0 && <p className="py-6 text-center text-sm text-muted">Ask a question below, or tap the microphone and speak. You can use English, Hindi or Hinglish.</p>}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-sm text-white">
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.viaVoice && (
                    <button onClick={() => { setInput(m.text); inputRef.current?.focus(); }} className="mt-1 text-xs text-slate-300 underline">
                      Spoken. Edit and resend
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <article key={m.id} className="max-w-[95%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white p-4 shadow-sm" aria-label="Assistant answer">
                <div className="mb-1 flex items-center gap-2">
                  {m.language && (
                    <span title={BADGE[m.language].title} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-navy">
                      {BADGE[m.language].label}
                    </span>
                  )}
                  {m.found === false && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">Not in the SOP</span>}
                </div>
                {m.error ? (
                  <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                    <p>{m.error}</p>
                    {m.retryText && (
                      <button onClick={() => { setMessages((all) => all.filter((x) => x.id !== m.id)); void send(m.retryText!); }} className="mt-2 rounded border border-red-300 px-2 py-1 text-xs hover:bg-red-100">
                        Try again
                      </button>
                    )}
                  </div>
                ) : m.text ? (
                  <>
                    <Markdown text={m.text} />
                    {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-navy align-middle" aria-hidden="true" />}
                  </>
                ) : (
                  <div className="space-y-2" aria-busy="true" aria-label="Thinking">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  </div>
                )}
                {!m.streaming && !m.error && m.citations && m.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Sources">
                    {m.citations.map((c, i) => (
                      <button key={i} onClick={() => onCite(c)} className="rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 text-xs text-ink hover:bg-gold/20" title="Show source passage">
                        {[c.section, c.page && `p. ${c.page}`, c.step && `step ${c.step}`].filter(Boolean).join(" · ") || "Source"}
                      </button>
                    ))}
                  </div>
                )}
                {!m.streaming && !m.error && m.text && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                    <AudioPlayer
                      active={speakingId === m.id}
                      state={speakingId === m.id ? speakerState : "idle"}
                      rate={settings.rate}
                      onPlay={() => speak(m)}
                      onPause={() => speaker.current?.pause()}
                      onResume={() => speaker.current?.resume()}
                      onStop={() => speaker.current?.stop()}
                      onRate={(r) => { setSettings({ rate: r }); speaker.current?.setRate(r); }}
                    />
                    <button onClick={() => navigator.clipboard.writeText(m.text).then(() => toast("Copied."))} className={iconBtn} aria-label="Copy answer" title="Copy">
                      <CopyIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => rate(m, 1)} disabled={!m.serverId} className={`${iconBtn} ${m.rating === 1 ? "bg-teal/20" : ""}`} aria-label="Helpful" aria-pressed={m.rating === 1}>
                      <ThumbUpIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => rate(m, -1)} disabled={!m.serverId} className={`${iconBtn} ${m.rating === -1 ? "bg-red-100" : ""}`} aria-label="Not helpful" aria-pressed={m.rating === -1}>
                      <ThumbDownIcon className="h-4 w-4" />
                    </button>
                    {m.citations?.[0] && (
                      <button onClick={() => onCite(m.citations![0])} className="ml-auto text-xs text-teal-700 underline">
                        Show source
                      </button>
                    )}
                  </div>
                )}
              </article>
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto max-w-3xl">
          {micError && (
            <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
              {micError} You can still type your question.
            </p>
          )}
          <div className="flex items-end gap-2">
            {listening ? (
              <div className="flex min-h-12 flex-1 items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-3" role="status" aria-label="Listening">
                <span className="text-sm font-medium text-red-700">Listening</span>
                <Waveform wave={wave} />
                <span className="tabular-nums text-sm text-red-700">{Math.floor(secs)}s / {MAX_RECORD_SECONDS}s</span>
                <button onClick={() => recorder.current?.cancel()} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-100">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder={micState === "processing" ? "Transcribing your voice..." : "Ask a question about this SOP"}
                  aria-label="Your question"
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-3 text-sm focus:border-teal focus:outline-none"
                />
                <button onClick={() => send(input)} disabled={sending || !input.trim()} aria-label="Send question" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-white hover:bg-navy-700 disabled:opacity-40">
                  <SendIcon className="h-5 w-5" />
                </button>
              </>
            )}
            {micSupported && <MicButton state={micState} onClick={toggleMic} disabled={sending && !listening} />}
          </div>
          {!micSupported && <p className="mt-2 text-xs text-muted">Voice input is not supported in this browser. Typing works everywhere.</p>}
        </div>
      </div>
      <ConfirmDialog open={confirmClear} title="Clear this conversation?" body="All questions and answers for this document will be deleted." confirmLabel="Clear" onConfirm={clearConversation} onCancel={() => setConfirmClear(false)} />
    </div>
  );
}
