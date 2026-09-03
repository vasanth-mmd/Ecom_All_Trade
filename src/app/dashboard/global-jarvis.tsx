"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/* A floating, site-wide voice assistant — press the mic on any dashboard page,
   ask a question about the Trade FR data, and JARVIS answers out loud.
   Persists its on/off preference in localStorage and stays mounted across
   page navigation (it lives in the shared dashboard layout), so the last
   exchange carries over as you move between Reports / FR Summary / Overview. */

type Msg = { role: "user" | "assistant"; content: string };

const STORE_KEY = "jarvis-widget-enabled";

const isTableRow = (line: string) => /^\|.*\|\s*$/.test(line.trim());
const isSeparatorRow = (line: string) =>
  /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());

/* strips chart JSON / markdown table pipes so speech + the mini transcript
   read like plain sentences instead of raw syntax */
function plainText(text: string) {
  return text
    .replace(/```chart[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => !isTableRow(l) && !isSeparatorRow(l))
    .join(" ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[#•]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function GlobalJarvis() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceReply, setVoiceReply] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [lastQ, setLastQ] = useState("");
  const [lastA, setLastA] = useState("");

  const msgsRef = useRef<Msg[]>([]);
  const recogRef = useRef<any>(null);
  const finalTextRef = useRef("");

  // restore the on/off preference once we're in the browser
  useEffect(() => {
    try { setEnabled(localStorage.getItem(STORE_KEY) === "1"); } catch {}
    setHydrated(true);
  }, []);

  function setEnabledPersist(v: boolean) {
    setEnabled(v);
    try { localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch {}
    if (v) {
      setOpen(true);
    } else {
      setOpen(false);
      recogRef.current?.abort();
      window.speechSynthesis?.cancel();
      setListening(false);
      setSpeaking(false);
    }
  }

  // Speech-to-text: auto-sends the moment you stop talking.
  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && !!window.speechSynthesis);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); return; }
    const recog = new SR();
    recog.lang = "en-IN";
    recog.interimResults = true;
    recog.continuous = false;
    recog.onresult = (e: any) => {
      let text = "", isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      setLastQ(text);
      if (isFinal) finalTextRef.current = text;
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => {
      setListening(false);
      const q = finalTextRef.current.trim();
      finalTextRef.current = "";
      if (q) ask(q);
    };
    recogRef.current = recog;
    return () => recog.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text: string) {
    if (!voiceReply || !window.speechSynthesis) return;
    const clean = plainText(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-IN";
    u.rate = 1.02;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  async function ask(question: string) {
    setBusy(true);
    setLastQ(question);
    setLastA("");
    const next = [...msgsRef.current, { role: "user" as const, content: question }].slice(-10);
    msgsRef.current = next;
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const d = await r.json();
      const reply = d.reply || d.error || "No reply.";
      msgsRef.current = [...next, { role: "assistant" as const, content: reply }].slice(-10);
      setLastA(reply);
      speak(reply);
    } catch (e: any) {
      const msg = "Network error: " + e.message;
      setLastA(msg);
    } finally {
      setBusy(false);
    }
  }

  function toggleListen() {
    const recog = recogRef.current;
    if (!recog || busy) return;
    if (listening) { recog.stop(); setListening(false); return; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLastQ("");
    finalTextRef.current = "";
    setListening(true);
    recog.start();
  }

  // The full JARVIS chat page already has its own voice UI — don't double up there.
  if (!hydrated || pathname?.startsWith("/dashboard/ai")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {enabled && open && (
        <div className="w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-amber-300/30 bg-[#0b1120]/95 backdrop-blur shadow-2xl text-slate-100 overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jarvis-logo.jpg" alt="" className="w-7 h-7 rounded-full object-cover shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <div className="text-sm font-bold tracking-wide flex-1">JARVIS</div>
            {speechSupported && (
              <button
                onClick={() => {
                  setVoiceReply((v) => !v);
                  if (voiceReply) window.speechSynthesis?.cancel();
                }}
                title={voiceReply ? "Mute spoken replies" : "Enable spoken replies"}
                className={"text-xs px-1.5 py-1 rounded-md " + (voiceReply ? "text-amber-300" : "text-slate-500")}
              >
                {voiceReply ? "🔊" : "🔇"}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-xs px-1.5 py-1">✕</button>
          </div>
          <div className="px-3.5 py-3 text-xs max-h-56 overflow-y-auto space-y-2">
            {!lastQ && !lastA && (
              <div className="text-slate-400">Press the mic and ask about the Trade FR data — works from any page.</div>
            )}
            {lastQ && <div className="text-indigo-300"><span className="text-slate-500">You: </span>{lastQ}</div>}
            {busy && <div className="text-amber-300">Analysing…</div>}
            {lastA && !busy && <div className="text-slate-200 whitespace-pre-wrap">{plainText(lastA) || lastA}</div>}
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-white/10">
            {voiceSupported ? (
              <button
                onClick={toggleListen}
                disabled={busy}
                className={"flex-1 py-2 rounded-xl text-sm font-bold transition " +
                  (listening
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-amber-500 text-[#1a1205] hover:bg-amber-400 disabled:bg-amber-500/40")}
              >
                {listening ? "⏹ Listening… tap to stop" : "🎤 Tap to ask"}
              </button>
            ) : (
              <div className="text-xs text-rose-300">Voice input isn't supported in this browser.</div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => (enabled ? setOpen((o) => !o) : setEnabledPersist(true))}
        title={enabled ? (open ? "Collapse JARVIS" : "Open JARVIS") : "Turn on the JARVIS voice assistant"}
        className={"relative w-14 h-14 rounded-full shadow-xl grid place-items-center border-2 transition overflow-hidden " +
          (enabled ? "border-amber-300" : "border-white/20 opacity-70 hover:opacity-100")}
        style={{
          background: enabled
            ? "radial-gradient(circle at 35% 30%, #ffd27a, #f59e0b 55%, #7c4a03)"
            : "#1e293b",
          boxShadow: enabled ? "0 0 22px rgba(245,158,11,.55)" : "none",
        }}
      >
        {enabled ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/jarvis-logo.jpg" alt="" className="w-full h-full rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <span className="text-xl">🎙️</span>
        )}
        {(listening || speaking) && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 border-2 border-[#0b1120] animate-pulse" />
        )}
      </button>

      {enabled && (
        <button
          onClick={() => setEnabledPersist(false)}
          className="text-[10px] text-slate-400 hover:text-rose-300 bg-[#0b1120]/80 px-2 py-0.5 rounded-full border border-white/10"
        >
          Turn off
        </button>
      )}
    </div>
  );
}
