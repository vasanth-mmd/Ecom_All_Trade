"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import SyncStatus from "../sync-status";

type Msg = {
  role: "user" | "assistant";
  content: string;
  engine?: string;
  fallback?: string;
  reason?: string;
  team?: string;
  timestamp?: string;
};

type Provider = { id: string; label: string; ready: boolean };

const PROMPT_CATEGORIES = [
  {
    id: "predict",
    label: "🔮 Predictive Forecasts",
    prompts: [
      "Forecast next month's fill rate and expected gap",
      "Where will this month land at current run-rate?",
      "Which SKUs are at highest risk of stockout next month?",
      "Which trade is trending downward and by how much?",
      "Predict daily momentum and 14-day trajectory",
    ],
  },
  {
    id: "diagnose",
    label: "🔍 Deep Diagnostics",
    prompts: [
      "Which city and SKU combination is causing the biggest value loss?",
      "Analyse Zero-Supply PO root causes across all trades",
      "Compare depot fulfillment: HO Depo vs Taloja vs Sunethra",
      "Why did Zepto fill rate drop and what are the top 5 deficit items?",
      "Show critical POs expiring in the next 48 hours",
    ],
  },
  {
    id: "whatif",
    label: "🧪 What-If Simulation",
    prompts: [
      "What if Zepto fill rate improves to 92%? How much value is recovered?",
      "Simulate 100% supply on Paneer and Curd across all cities",
      "What if we eliminate all Zero Supply POs in Bangalore and Mumbai?",
      "What if Blinkit PO volume grows by 20% next month?",
    ],
  },
  {
    id: "action",
    label: "⚡ Action & Dispatch",
    prompts: [
      "Give me the top 5 immediate dispatch priorities for today",
      "Recommend depot stock re-allocations to maximize FR",
      "Which POs need urgent attention before expiry?",
      "What is the single highest-value action to hit 90% overall FR?",
    ],
  },
];

export default function AiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [engine, setEngine] = useState<string>("auto");
  const [activeCategory, setActiveCategory] = useState<string>("predict");
  const [activeView, setActiveView] = useState<"chat" | "simulator" | "forecast" | "anomalies">("chat");

  // Voice State
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [voiceReply, setVoiceReply] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  // Scenario Simulator State
  const [simTrade, setSimTrade] = useState("Zepto");
  const [simTargetFr, setSimTargetFr] = useState(90);
  const [simCategory, setSimCategory] = useState("All");

  // Canvas ref for appetising interactive visual background
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const finalTextRef = useRef("");

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.providers)) setProviders(d.providers);
        if (d?.active) setEngine(d.active);
      })
      .catch(() => {});
  }, []);

  // ── Appetising Live Interactive Canvas Background (Dairy-Lux Nebula Particles) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const onResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", onResize);

    // Particle system with glowing amber & creamy sapphire orbs
    const particleCount = Math.min(45, Math.floor((width * height) / 25000));
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
      pulse: number;
      pulseSpeed: number;
    }[] = [];

    const colors = [
      "rgba(245, 158, 11,", // Gold / Amber
      "rgba(251, 191, 36,", // Bright Gold
      "rgba(99, 102, 241,",  // Indigo
      "rgba(139, 92, 246,",  // Purple
      "rgba(255, 237, 213,", // Rich Cream
      "rgba(56, 189, 248,",  // Cyan
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 3 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
      });
    }

    let mouseX = width / 2;
    let mouseY = height / 2;
    let mouseActive = false;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseActive = true;
    };

    const onMouseLeave = () => {
      mouseActive = false;
    };

    canvas.parentElement?.addEventListener("mousemove", onMouseMove);
    canvas.parentElement?.addEventListener("mouseleave", onMouseLeave);

    let time = 0;

    const render = () => {
      time += 0.005;
      ctx.clearRect(0, 0, width, height);

      // Creamy luminous cosmic radial gradients
      const grad1 = ctx.createRadialGradient(
        width * 0.3 + Math.sin(time) * 60,
        height * 0.4 + Math.cos(time * 0.8) * 50,
        0,
        width * 0.3,
        height * 0.4,
        width * 0.55
      );
      grad1.addColorStop(0, "rgba(245, 158, 11, 0.08)");
      grad1.addColorStop(0.5, "rgba(139, 92, 246, 0.04)");
      grad1.addColorStop(1, "rgba(6, 10, 25, 0)");
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const grad2 = ctx.createRadialGradient(
        width * 0.75 + Math.cos(time * 0.7) * 70,
        height * 0.65 + Math.sin(time * 0.9) * 60,
        0,
        width * 0.75,
        height * 0.65,
        width * 0.5
      );
      grad2.addColorStop(0, "rgba(56, 189, 248, 0.06)");
      grad2.addColorStop(0.6, "rgba(99, 102, 241, 0.03)");
      grad2.addColorStop(1, "rgba(6, 10, 25, 0)");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Render connected particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Subtle interactive mouse attraction
        if (mouseActive) {
          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            p.x += (dx / dist) * 0.5;
            p.y += (dy / dist) * 0.5;
          }
        }

        const currentAlpha = p.alpha * (0.7 + Math.sin(p.pulse) * 0.3);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color} ${currentAlpha})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `${p.color} 0.8)`;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw connective filaments
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const lineAlpha = (1 - dist / 110) * 0.15;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(245, 158, 11, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      canvas.parentElement?.removeEventListener("mousemove", onMouseMove);
      canvas.parentElement?.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  // Voice speech-to-text
  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && !!window.speechSynthesis);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      return;
    }
    const recog = new SR();
    recog.lang = "en-IN";
    recog.interimResults = true;
    recog.continuous = false;
    recog.onresult = (e: any) => {
      let text = "",
        isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      setInput(text);
      if (isFinal) finalTextRef.current = text;
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => {
      setListening(false);
      const q = finalTextRef.current.trim();
      finalTextRef.current = "";
      if (q) send(q);
    };
    recogRef.current = recog;
    return () => recog.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleVoice() {
    const recog = recogRef.current;
    if (!recog) return;
    if (listening) {
      recog.stop();
      setListening(false);
      return;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setInput("");
    finalTextRef.current = "";
    setListening(true);
    recog.start();
  }

  function speak(text: string) {
    if (!voiceReply || !window.speechSynthesis) return;
    const clean = text
      .replace(/```chart[\s\S]*?```/g, "")
      .split("\n")
      .filter((l) => !isTableRow(l) && !isSeparatorRow(l))
      .join(" ")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/[#•]/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const next: Msg[] = [...msgs, { role: "user", content: question, timestamp: now }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setActiveView("chat");

    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          provider: engine === "auto" ? undefined : engine,
        }),
      });
      const d = await r.json();
      const reply = d.reply || d.error || "No response.";
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: reply,
          engine: d.engine,
          fallback: d.fellBackFrom ? `${d.fellBackFrom} unavailable → answered by ${d.engine}` : undefined,
          reason: d.fallbackReason,
          team: d.team,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      speak(reply);
    } catch (e: any) {
      const msg = "Network error: " + e.message;
      setMsgs([...next, { role: "assistant", content: msg, timestamp: now }]);
      speak(msg);
    } finally {
      setBusy(false);
    }
  }

  const ready = providers.filter((p) => p.ready);
  const currentCategoryObj = PROMPT_CATEGORIES.find((c) => c.id === activeCategory) || PROMPT_CATEGORIES[0];

  return (
    <div className="relative h-full flex flex-col bg-[#050814] text-slate-100 overflow-hidden font-sans select-none">
      {/* ── Live Appetising Particle & Fluid Waves Canvas ── */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-auto z-0 opacity-90" />

      {/* ── Ambient Radial Glows ── */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none z-0" />

      {/* ── Top Executive Navigation & Header Strip ── */}
      <div className="relative z-10 px-4 sm:px-6 py-3.5 bg-black/40 backdrop-blur-xl border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <JarvisReactorAvatar size={42} isBusy={busy} isSpeaking={speaking} isListening={listening} />
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-black text-white tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 bg-clip-text text-transparent">
                JARVIS AI INTELLIGENCE
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-400/30">
                PRO 2026
              </span>
              <SyncStatus dark />
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Autonomous Trade FR Diagnostics, Statistical Forecasting & What-If Simulations
            </p>
          </div>
        </div>

        {/* Action Controls & Engine Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Navigation View Switcher */}
          <div className="inline-flex rounded-xl border border-white/10 p-1 bg-white/5 backdrop-blur-md">
            {[
              { id: "chat", label: "💬 Chat" },
              { id: "simulator", label: "🧪 What-If Simulator" },
              { id: "forecast", label: "🔮 Forecast Radar" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeView === tab.id
                    ? "bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Engine Selector */}
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Engine:</span>
            {[
              { id: "auto", label: "Auto", ready: ready.length > 0 },
              { id: "team", label: "🤝 Team", ready: ready.length > 1 },
              ...providers,
            ].map((p) => (
              <button
                key={p.id}
                disabled={!p.ready}
                onClick={() => setEngine(p.id)}
                title={
                  p.ready
                    ? p.id === "team"
                      ? "Multi-engine consensus merge"
                      : `Route through ${p.label}`
                    : "API key not configured in .env"
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  !p.ready
                    ? "border-white/10 text-slate-600 cursor-not-allowed"
                    : engine === p.id
                    ? "border-amber-400 bg-amber-400/20 text-amber-200 shadow-sm"
                    : "border-white/15 text-slate-300 hover:border-amber-300/50 hover:text-amber-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Voice Response Toggle */}
          {speechSupported && (
            <button
              onClick={() => {
                setVoiceReply((v) => !v);
                if (voiceReply) window.speechSynthesis?.cancel();
              }}
              title={voiceReply ? "Voice replies enabled (Click to mute)" : "Voice replies muted (Click to unmute)"}
              className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                voiceReply
                  ? "border-amber-400/60 bg-amber-400/20 text-amber-200 shadow-sm"
                  : "border-white/15 text-slate-400 hover:border-amber-300/40"
              }`}
            >
              {voiceReply ? "🔊" : "🔇"}
            </button>
          )}

          {msgs.length > 0 && (
            <button
              onClick={() => setMsgs([])}
              className="p-2 rounded-xl text-xs font-bold border border-white/15 text-slate-400 hover:text-rose-300 hover:border-rose-400/40 transition cursor-pointer"
              title="Clear Conversation"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* ── Main Work Area ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6">
        {/* ── VIEW 1: WHAT-IF SCENARIO SIMULATOR ── */}
        {activeView === "simulator" && (
          <div className="max-w-4xl mx-auto bg-slate-900/80 backdrop-blur-2xl border border-amber-400/30 rounded-3xl p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🧪</span>
                  <h2 className="text-xl font-black text-white">What-If Fulfillment Simulator</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust fill rate targets and predict recovered revenue & company-wide uplift.
                </p>
              </div>
              <button
                onClick={() => setActiveView("chat")}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 text-slate-300 hover:bg-white/10 transition"
              >
                Back to Chat ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Select Trade Platform
                </label>
                <select
                  value={simTrade}
                  onChange={(e) => setSimTrade(e.target.value)}
                  className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="Zepto">Zepto</option>
                  <option value="Blinkit">Blinkit</option>
                  <option value="Swiggy">Swiggy Instamart</option>
                  <option value="Amazon">Amazon</option>
                  <option value="BigBasket">BigBasket</option>
                  <option value="All Trades">All Trades Combined</option>
                </select>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Target Fill Rate %
                  </label>
                  <span className="text-sm font-black text-amber-400">{simTargetFr}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="1"
                  value={simTargetFr}
                  onChange={(e) => setSimTargetFr(+e.target.value)}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>60%</span>
                  <span>80%</span>
                  <span>95%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Category Focus
                </label>
                <select
                  value={simCategory}
                  onChange={(e) => setSimCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="All">All Categories</option>
                  <option value="Paneer">Paneer</option>
                  <option value="Curd">Curd & Yogurt</option>
                  <option value="Cheese">Cheese</option>
                  <option value="Butter">Butter & Ghee</option>
                </select>
              </div>
            </div>

            {/* Simulation Preview & Action */}
            <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-transparent border border-amber-400/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-slate-300">
                  Simulating: <span className="text-amber-300 font-extrabold">{simTrade}</span> reaching{" "}
                  <span className="text-emerald-400 font-extrabold">{simTargetFr}% Fill Rate</span> in{" "}
                  <span className="text-purple-300 font-extrabold">{simCategory}</span>.
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  JARVIS will compute exact value recovery, required SKU dispatch volumes, and month-end trajectory.
                </div>
              </div>
              <button
                onClick={() => {
                  const prompt = `Simulate What-If scenario: What if ${simTrade} achieves ${simTargetFr}% fill rate across ${simCategory} category? Calculate the exact recovered gap in ₹ Lakhs, the new company-wide fill rate, and give the required dispatch actions.`;
                  send(prompt);
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-lg transition active:scale-95 cursor-pointer shrink-0"
              >
                🚀 Run Simulation in AI
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW 2: FORECAST RADAR DECK ── */}
        {activeView === "forecast" && (
          <div className="max-w-4xl mx-auto bg-slate-900/80 backdrop-blur-2xl border border-purple-400/30 rounded-3xl p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔮</span>
                  <h2 className="text-xl font-black text-white">Statistical Forecast & Momentum Radar</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Server-computed deterministic projections using Ordinary Least Squares & moving averages.
                </p>
              </div>
              <button
                onClick={() => setActiveView("chat")}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 text-slate-300 hover:bg-white/10 transition"
              >
                Back to Chat ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  📈 Month-End Landing Projection
                </div>
                <p className="text-xs text-slate-300">
                  Projects current calendar month fill rate based on active 14-day daily run-rate.
                </p>
                <button
                  onClick={() => send("Where will this month land at month end? Show the projected gap and FR range.")}
                  className="w-full py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 border border-purple-400/30 text-purple-200 font-bold text-xs transition text-center"
                >
                  Ask Month-End Forecast →
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  🗓️ Next Calendar Month Horizon
                </div>
                <p className="text-xs text-slate-300">
                  Predicts next month fill rate with statistical high/low confidence bounds.
                </p>
                <button
                  onClick={() => send("Forecast next month's fill rate, expected gap, and trade outlook.")}
                  className="w-full py-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-400/30 text-emerald-200 font-bold text-xs transition text-center"
                >
                  Ask Next Month Forecast →
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                  ⚠️ SKU & City Risk Watchlist
                </div>
                <p className="text-xs text-slate-300">
                  Identifies SKUs and cities with highest projected slippage value.
                </p>
                <button
                  onClick={() => send("Which SKUs and cities are on the risk watchlist for next month?")}
                  className="w-full py-2 rounded-xl bg-rose-900/60 hover:bg-rose-800 border border-rose-400/30 text-rose-200 font-bold text-xs transition text-center"
                >
                  Identify Risk Watchlist →
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  ⚡ Daily Momentum & Direction
                </div>
                <p className="text-xs text-slate-300">
                  Slope per day and 7-day moving average trajectory.
                </p>
                <button
                  onClick={() => send("What is our current daily momentum slope and 7-day moving average?")}
                  className="w-full py-2 rounded-xl bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-400/30 text-cyan-200 font-bold text-xs transition text-center"
                >
                  Evaluate Daily Momentum →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── VIEW 3: INTERACTIVE CHAT STREAM ── */}
        {msgs.length === 0 ? (
          <div className="max-w-3xl mx-auto mt-6 text-center space-y-6">
            <div className="flex justify-center">
              <JarvisReactorAvatar size={80} isBusy={busy} isSpeaking={speaking} isListening={listening} />
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                JARVIS Intelligence Core Online
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto mt-1 font-medium">
                Ask any question about trade performance, forecast month-end outcomes, or simulate supply scenarios.
              </p>
            </div>

            {/* Prompt Categories Navigation */}
            <div className="flex justify-center gap-2 flex-wrap">
              {PROMPT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    activeCategory === cat.id
                      ? "bg-amber-400/20 border-amber-300 text-amber-200 shadow-md"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Suggested Prompt Chips */}
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
              {currentCategoryObj.prompts.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => send(s)}
                  className="text-xs px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-amber-400/15 hover:border-amber-300/60 text-slate-200 transition backdrop-blur-md cursor-pointer text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end items-end gap-2">
                  <div className="max-w-[80%] bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-3xl rounded-br-sm px-5 py-3 text-sm shadow-xl border border-indigo-400/30 whitespace-pre-wrap">
                    {m.content}
                    {m.timestamp && (
                      <div className="text-[10px] text-indigo-200/70 text-right mt-1 font-mono">
                        {m.timestamp}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-3">
                  <JarvisReactorAvatar size={34} isSpeaking={speaking} isBusy={false} isListening={false} />
                  <div className="max-w-[90%] sm:max-w-[85%] space-y-1.5">
                    <div className="bg-slate-900/90 border border-white/20 backdrop-blur-2xl rounded-3xl rounded-bl-sm p-4 sm:p-5 text-sm shadow-2xl text-slate-100">
                      <AssistantContent text={m.content} />

                      {/* Response Action Bar */}
                      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3 text-xs flex-wrap">
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          {m.engine && (
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[10px] text-amber-300">
                              {m.fallback || m.engine}
                            </span>
                          )}
                          {m.team && (
                            <span className="text-emerald-400 font-semibold">
                              🤝 Synthesized from {m.team}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                            }}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition font-medium text-[11px] flex items-center gap-1"
                            title="Copy response"
                          >
                            <span>📋</span> Copy
                          </button>
                          <button
                            onClick={() => speak(m.content)}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition font-medium text-[11px] flex items-center gap-1"
                            title="Read aloud"
                          >
                            <span>🔊</span> Listen
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {busy && (
              <div className="flex items-start gap-3">
                <JarvisReactorAvatar size={34} isBusy={true} isSpeaking={false} isListening={false} />
                <div className="bg-slate-900/90 border border-amber-400/40 rounded-2xl px-5 py-3 text-sm text-amber-200 shadow-xl backdrop-blur-xl flex items-center gap-3">
                  <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="font-bold tracking-wide animate-pulse">
                    Synthesizing Cross-Dataset Diagnostics & Forecasts…
                  </span>
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {/* ── Bottom Floating Input Bar ── */}
      <div className="relative z-10 px-4 sm:px-6 py-4 bg-black/50 backdrop-blur-2xl border-t border-white/10">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={
              listening
                ? "🎙️ Listening… Speak your analysis or forecast question"
                : "Ask JARVIS (e.g. Forecast next month fill rate, or Simulate Zepto at 92%...)"
            }
            className="flex-1 border border-white/20 bg-slate-950/70 text-white placeholder:text-slate-400 rounded-2xl px-4 py-3 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 backdrop-blur-md transition shadow-inner"
            disabled={busy}
          />

          {voiceSupported && (
            <button
              onClick={toggleVoice}
              disabled={busy}
              title={
                listening
                  ? "Stop listening"
                  : "Speak hands-free (Sends automatically when you finish speaking)"
              }
              className={`p-3 rounded-2xl text-sm font-bold border transition cursor-pointer shrink-0 ${
                listening
                  ? "bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/50"
                  : "bg-white/10 border-white/20 text-slate-200 hover:border-amber-300 hover:text-amber-200"
              }`}
            >
              {listening ? "⏹" : "🎤"}
            </button>
          )}

          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 text-sm font-black disabled:opacity-40 hover:from-amber-400 hover:to-amber-300 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer shrink-0"
          >
            Send ➔
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Glowing Holographic JARVIS Arc Reactor Component ── */
function JarvisReactorAvatar({
  size = 36,
  isBusy = false,
  isSpeaking = false,
  isListening = false,
}: {
  size?: number;
  isBusy?: boolean;
  isSpeaking?: boolean;
  isListening?: boolean;
}) {
  return (
    <div
      className="relative grid place-items-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
      }}
    >
      {/* Outer pulsing ring */}
      <div
        className={`absolute inset-0 rounded-full border transition-all duration-300 ${
          isListening
            ? "border-rose-500 animate-ping opacity-75"
            : isSpeaking
            ? "border-amber-400 animate-pulse opacity-90"
            : isBusy
            ? "border-amber-300 animate-spin opacity-80"
            : "border-amber-400/40"
        }`}
      />

      {/* Holographic Glowing Core */}
      <div
        className="w-full h-full rounded-full grid place-items-center overflow-hidden"
        style={{
          background: isListening
            ? "radial-gradient(circle at 35% 30%, #f43f5e, #be123c 60%, #4c0519)"
            : "radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 55%, #78350f)",
          boxShadow: isListening
            ? "0 0 20px rgba(244, 63, 94, 0.8)"
            : "0 0 20px rgba(245, 158, 11, 0.6)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/jarvis-logo.jpg"
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    </div>
  );
}

/* ── Content Render with Markdown Tables & Dynamic SVG Charts ── */

function AssistantContent({ text }: { text: string }) {
  const parts: ({ t: "text"; v: string } | { t: "chart"; v: any })[] = [];
  const re = /```chart\s*([\s\S]*?)```/g;
  let last = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    try {
      parts.push({ t: "chart", v: JSON.parse(m[1]) });
    } catch {
      parts.push({ t: "text", v: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });

  return (
    <div className="space-y-4">
      {parts.map((p, i) =>
        p.t === "text" ? <FormattedText key={i} text={p.v} /> : <MiniChart key={i} spec={p.v} />
      )}
    </div>
  );
}

const escBold = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b class='text-amber-300 font-bold'>$1</b>");

const isTableRow = (line: string) => /^\|.*\|\s*$/.test(line.trim());
const isSeparatorRow = (line: string) =>
  /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());
const isNumericCell = (s: string) => {
  const bare = s.replace(/\*\*/g, "").replace(/[₹%,L\s]/g, "");
  return bare !== "" && !isNaN(Number(bare.replace(/^-/, "").replace(/^\+/, "")));
};

function FormattedText({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return null;

  const lines = t.split("\n");
  const blocks: ({ t: "html"; v: string } | { t: "table"; rows: string[][] })[] = [];
  let textBuf: string[] = [];
  let tableBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length) {
      const html = textBuf
        .join("\n")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<b class='text-amber-200 font-extrabold'>$1</b>")
        .replace(/^### (.+)$/gm, "<div class='text-sm font-black text-amber-300 mt-2 mb-1'>$1</div>")
        .replace(/^## (.+)$/gm, "<div class='text-base font-black text-white mt-2 mb-1'>$1</div>")
        .replace(/^- (.+)$/gm, "<div class='flex items-start gap-1.5 my-0.5'><span class='text-amber-400'>•</span><span>$1</span></div>")
        .replace(/\n/g, "<br/>");
      blocks.push({ t: "html", v: html });
      textBuf = [];
    }
  };
  const flushTable = () => {
    const rows = tableBuf
      .filter((l) => !isSeparatorRow(l))
      .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
    if (rows.length) blocks.push({ t: "table", rows });
    tableBuf = [];
  };

  for (const line of lines) {
    if (isTableRow(line)) {
      flushText();
      tableBuf.push(line);
    } else {
      flushTable();
      textBuf.push(line);
    }
  }
  flushText();
  flushTable();

  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.t === "html" ? (
          <div key={i} className="leading-relaxed text-slate-200 text-xs sm:text-sm" dangerouslySetInnerHTML={{ __html: b.v }} />
        ) : (
          <MdTable key={i} rows={b.rows} />
        )
      )}
    </div>
  );
}

function MdTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const [header, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950/60 shadow-xl my-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-white/10 border-b border-white/15 text-amber-300 font-black tracking-wider">
            {header.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {body.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-white/5" : "hover:bg-white/10 transition-colors"}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 whitespace-nowrap ${
                    isNumericCell(c) ? "text-right font-mono font-bold text-slate-200" : "text-left font-medium text-slate-300"
                  }`}
                  dangerouslySetInnerHTML={{ __html: escBold(c) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniChart({ spec }: { spec: any }) {
  const labels: string[] = spec?.labels || [];
  const values: number[] = (spec?.values || []).map(Number);
  if (!labels.length || labels.length !== values.length)
    return <div className="text-xs text-slate-400">[chart unavailable]</div>;
  const W = 460,
    H = 210,
    P = { l: 45, r: 15, t: 28, b: 46 };
  const max = Math.max(...values, 0) * 1.15 || 1;
  const min = Math.min(...values, 0);
  const iw = W - P.l - P.r,
    ih = H - P.t - P.b;
  const y = (v: number) => P.t + ih - ((v - Math.min(0, min)) / (max - Math.min(0, min))) * ih;
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });

  return (
    <div className="border border-amber-400/30 rounded-2xl p-4 bg-slate-950/80 shadow-2xl backdrop-blur-xl my-2">
      {spec.title && (
        <div className="text-xs font-black text-amber-300 mb-2 flex items-center justify-between">
          <span>{spec.title}</span>
          {spec.unit && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400 font-mono">
              {spec.unit}
            </span>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((f) => {
          const v = Math.min(0, min) + f * (max - Math.min(0, min));
          return (
            <g key={f}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <text x={P.l - 6} y={y(v) + 3} fontSize="9" fill="#94a3b8" textAnchor="end" fontFamily="monospace">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {spec.type === "line" ? (
          <>
            {/* Gradient fill under line */}
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d={
                values.map((v, i) => (i ? "L" : "M") + (P.l + (i * iw) / Math.max(1, values.length - 1)) + " " + y(v)).join(" ") +
                ` L ${P.l + iw} ${P.t + ih} L ${P.l} ${P.t + ih} Z`
              }
              fill="url(#chartGrad)"
            />
            <path
              d={values
                .map((v, i) => (i ? "L" : "M") + (P.l + (i * iw) / Math.max(1, values.length - 1)) + " " + y(v))
                .join(" ")}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2.5"
            />
            {values.map((v, i) => {
              const cx = P.l + (i * iw) / Math.max(1, values.length - 1);
              const cy = y(v);
              const label = fmt(v);
              const lw = Math.max(22, label.length * 6.5 + 8);
              const labelUp = cy - P.t > 18;
              return (
                <g key={i}>
                  <rect
                    x={cx - lw / 2}
                    y={labelUp ? cy - 22 : cy + 8}
                    width={lw}
                    height={15}
                    rx="4"
                    fill="#1e1b4b"
                    stroke="#818cf8"
                    strokeWidth="0.8"
                  />
                  <text
                    x={cx}
                    y={labelUp ? cy - 11 : cy + 19}
                    fontSize="9.5"
                    fill="#e0e7ff"
                    textAnchor="middle"
                    fontWeight="800"
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                  <circle cx={cx} cy={cy} r="4" fill="#fbbf24" stroke="#0f172a" strokeWidth="1.5" />
                </g>
              );
            })}
          </>
        ) : (
          values.map((v, i) => {
            const bw = (iw / values.length) * 0.58;
            const x = P.l + (i + 0.21) * (iw / values.length);
            const label = fmt(v);
            const lw = Math.max(bw, label.length * 6.5 + 8);
            const top = y(Math.max(0, v));
            const aboveChart = top - P.t > 16;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={top}
                  width={bw}
                  height={Math.abs(y(v) - y(0))}
                  rx="5"
                  fill="url(#barGrad)"
                />
                <rect
                  x={x + bw / 2 - lw / 2}
                  y={aboveChart ? top - 19 : top + 5}
                  width={lw}
                  height={15}
                  rx="4"
                  fill="#1e1b4b"
                  stroke="#818cf8"
                  strokeWidth="0.8"
                />
                <text
                  x={x + bw / 2}
                  y={aboveChart ? top - 8 : top + 16}
                  fontSize="9.5"
                  fill="#e0e7ff"
                  textAnchor="middle"
                  fontWeight="800"
                  fontFamily="monospace"
                >
                  {label}
                </text>
              </g>
            );
          })
        )}
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>
        {labels.map((lb, i) => (
          <text
            key={i}
            x={
              spec.type === "line"
                ? P.l + (i * iw) / Math.max(1, values.length - 1)
                : P.l + (i + 0.5) * (iw / values.length)
            }
            y={H - P.b + 16}
            fontSize="9.5"
            fill="#94a3b8"
            textAnchor="middle"
            fontWeight="600"
          >
            {String(lb).length > 10 ? String(lb).slice(0, 9) + "…" : lb}
          </text>
        ))}
      </svg>
    </div>
  );
}
