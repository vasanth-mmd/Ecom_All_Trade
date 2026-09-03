import Link from "next/link";
import SiteHeader from "./site-header";
import Reveal from "./reveal";
import ProductMarquee from "./product-marquee";
import TiltCard from "./tilt-card";
import Spotlight from "./spotlight";
import LiveBackground from "./live-background";

const TRADES = ["Amazon", "Blinkit", "Zepto", "Swiggy", "BigBasket", "Flipkart"];

const MODULES = [
  { icon: "▦", title: "Overview", body: "Headline fill-rate numbers, trade performance and the monthly trend the moment you log in." },
  { icon: "📊", title: "Full Dashboard", body: "Every chart, slicer and click-to-filter gap analysis in one screen." },
  { icon: "📋", title: "Reports", body: "Detailed PO-level breakdowns, ready to slice by trade, city or SKU." },
  { icon: "⚡", title: "Priority PO Fill Center", body: "Real-time urgency ranking & pick lists to immediately dispatch upcoming expiring POs." },
  { icon: "🧮", title: "FR % Summary", body: "City, SKU, Trade and Region fill-rate tables side by side, cross-filterable." },
  { icon: "🤖", title: "Jarvis AI", body: "Ask questions in plain language — Claude, GPT and Gemini can even work together on one answer." },
];

const HIGHLIGHTS = [
  { title: "Cross-filter everything", body: "Click any row in any table — Trade, Region, City or SKU — and every chart on the page filters with it." },
  { title: "3 AI engines, 1 answer", body: "Turn on Team mode and Claude, GPT and Gemini each draft an answer, then merge into one combined reply." },
  { title: "Export the raw data anytime", body: "Reconstruct and download the underlying PO data as an Excel file whenever you need it." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-transparent relative selection:bg-purple-200 selection:text-purple-900">
      {/* ── Live Appetizing Ambient Background ── */}
      <LiveBackground />
      <SiteHeader />

      {/* ── Hero Section: Creamy Glassmorphism with Live Ambient Light ── */}
      <section className="relative z-[1] mx-3 sm:mx-6 mt-2 rounded-[3.5rem] bg-white/75 backdrop-blur-2xl border border-white/90 shadow-[0_25px_80px_-20px_rgba(79,23,135,0.1)] overflow-hidden">
        <Spotlight>
          {/* Subtle Ambient Radial Glows */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-blob-a absolute -top-32 -left-20 w-[30rem] h-[30rem] rounded-full bg-rose-200/30 blur-3xl" />
            <div className="animate-blob-b absolute top-12 -right-32 w-[34rem] h-[34rem] rounded-full bg-purple-300/25 blur-3xl" />
            <div className="animate-blob-c absolute -bottom-36 left-1/3 w-[26rem] h-[26rem] rounded-full bg-amber-200/25 blur-3xl" />
          </div>

          <div className="relative max-w-4xl mx-auto text-center px-6 pt-16 sm:pt-20 pb-6 sm:pb-8">
            {/* Live Status Badge */}
            <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-purple-200/90 text-purple-900 text-xs font-black tracking-wide mb-6 shadow-sm shadow-purple-500/10 backdrop-blur-xl">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>TRADE FILL RATE · 2026 LIVE</span>
            </div>

            {/* Main Headline with Clean Typesetting */}
            <h1 className="animate-fade-up-delay-1 text-4xl sm:text-6xl font-black tracking-tight text-purple-950 leading-[1.12]">
              Real-Time Zepto Trade Fill Rate
              <br className="hidden sm:inline" />{" "}
              <span className="animate-text-shimmer bg-gradient-to-r from-purple-700 via-fuchsia-600 to-amber-500 bg-[length:200%_auto] bg-clip-text text-transparent drop-shadow-xs">
                Intelligence
              </span>
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-up-delay-1 mt-5 text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
              PO fulfilment at a glance — fill rate by value and quantity across every
              trade, city and SKU, with live drill-downs into where the gap actually sits.
            </p>

            {/* Single Prominent Login Action Button (Signup Removed) */}
            <div className="animate-fade-up-delay-2 mt-8 sm:mt-10 flex items-center justify-center">
              <Link
                href="/login"
                className="group relative inline-flex items-center justify-center gap-2.5 rounded-2xl px-10 py-4 font-black text-white text-lg shadow-xl shadow-purple-900/30 hover:shadow-2xl hover:shadow-purple-700/40 hover:-translate-y-1 active:scale-95 transition-all duration-300 overflow-hidden cursor-pointer"
              >
                {/* Animated Gradient Fill */}
                <span className="absolute inset-0 bg-gradient-to-r from-purple-700 via-fuchsia-600 to-indigo-600 bg-[length:200%_100%] animate-btn-gradient rounded-2xl" />
                {/* Specular Glaze */}
                <span className="absolute inset-[1px] rounded-[15px] bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />
                {/* Shimmer Sweep */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent transform -skew-x-12 transition-transform ease-in-out" />

                <span className="relative z-10 flex items-center gap-2.5 tracking-wide">
                  <span className="text-amber-300 text-xl group-hover:rotate-12 transition-transform duration-300">✦</span>
                  <span>Open Dashboard / Log in</span>
                  <span className="text-white/90 group-hover:translate-x-1.5 transition-transform text-xl">→</span>
                </span>
              </Link>
            </div>
          </div>

          {/* ── Scrolling Product Showcase (Exact Marquee & Images Preserved) ── */}
          <div className="animate-fade-up-delay-2 relative pb-8 sm:pb-10 pt-2">
            <ProductMarquee />
          </div>
        </Spotlight>
      </section>

      {/* ── Capability Strip (4 Glassmorphic Stat Pills) ── */}
      <section className="relative -mt-6 z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl shadow-xl shadow-purple-950/5 border border-purple-100/80 grid grid-cols-2 sm:grid-cols-4 divide-x divide-purple-100/70">
            {[
              { label: "Trade", value: "Zepto" },
              { label: "Drill-down", value: "Trade → Region → City → SKU" },
              { label: "AI engines", value: "Claude, GPT & Gemini, working together" },
              { label: "Always current", value: "Every dashboard updates by using Current Data" },
            ].map((s, i, arr) => (
              <Reveal key={s.label} className="flip-in" delayMs={i * 90}>
                <Stat label={s.label} value={s.value} first={i === 0} last={i === arr.length - 1} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Infinite Trade Ticker ── */}
      <section className="relative z-[1] bg-transparent py-10 mt-4">
        <div className="marquee-pause relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <div className="animate-marquee flex items-center gap-14 w-max">
            {[...TRADES, ...TRADES].map((t, i) => (
              <span
                key={i}
                className="text-xl sm:text-2xl font-black bg-gradient-to-r from-purple-900/35 via-fuchsia-900/40 to-indigo-900/35 bg-clip-text text-transparent tracking-wide whitespace-nowrap hover:text-purple-700 transition-colors"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Modules Grid ── */}
      <section className="relative z-[1] bg-white/40 py-20 backdrop-blur-xs">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="text-center">
            <div className="inline-block px-3.5 py-1.5 rounded-full bg-purple-100/80 border border-purple-200/80 text-purple-800 text-xs font-black tracking-widest uppercase mb-3 shadow-xs">
              Modules
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-purple-950">Everything in One Dashboard</h2>
            <p className="mt-2 text-sm font-medium text-slate-600 max-w-xl mx-auto">
              Six focused views, one login — built around how the trade fill-rate workflow actually runs.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m, i) => (
              <Reveal key={m.title} delayMs={(i % 3) * 90}>
                <TiltCard className="rounded-3xl">
                  <div className="shine group p-6 rounded-3xl bg-white/90 backdrop-blur-xl border border-purple-100/80 shadow-md shadow-purple-950/5 hover:shadow-2xl hover:shadow-purple-500/15 hover:border-purple-300 transition-all duration-300">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 via-fuchsia-50 to-purple-50 border border-purple-200/60 grid place-items-center text-xl text-purple-800 group-hover:scale-110 shadow-inner transition-transform duration-300">
                      {m.icon}
                    </div>
                    <div className="mt-4 font-black text-lg text-purple-950">{m.title}</div>
                    <div className="mt-1.5 text-xs font-medium text-slate-600 leading-relaxed">{m.body}</div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 via-fuchsia-600 to-purple-800 text-white text-sm font-bold shadow-lg shadow-purple-900/20 hover:shadow-xl hover:shadow-purple-600/30 hover:-translate-y-0.5 active:scale-95 transition-all"
            >
              View all modules <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Built for Your Workflow ── */}
      <section className="relative z-[1] bg-white/30 py-20 backdrop-blur-xs">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="text-center">
            <div className="inline-block px-3.5 py-1.5 rounded-full bg-white/90 text-purple-800 text-xs font-black tracking-widest uppercase mb-3 border border-purple-200/80 shadow-xs">
              Highlights
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-purple-950">Built for Your Workflow</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {HIGHLIGHTS.map((h, i) => (
              <Reveal key={h.title} delayMs={i * 100}>
                <TiltCard className="rounded-3xl">
                  <div className="shine relative p-7 rounded-3xl bg-white/90 backdrop-blur-xl border border-purple-100/80 shadow-md shadow-purple-950/5 hover:shadow-2xl hover:shadow-purple-500/15 hover:border-purple-300 transition-all duration-300 overflow-hidden">
                    <div
                      className="absolute -top-6 -right-4 text-7xl font-black text-purple-200/40 select-none animate-float"
                      style={{ animationDelay: i * 0.4 + "s" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="relative font-black text-lg text-purple-950">{h.title}</div>
                    <div className="relative mt-2 text-xs font-medium text-slate-600 leading-relaxed">{h.body}</div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="flex-1 relative z-[1] bg-white/70 border-t border-purple-100/70 pt-10 pb-6 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="font-black text-purple-950 mb-2.5">Dashboard</div>
            <ul className="space-y-1.5 font-semibold text-slate-600 text-xs">
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Overview</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Full Dashboard</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Reports</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Priority PO Fill Center</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Daily PO & Gap Tracker</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">FR % Summary</li>
            </ul>
          </div>
          <div>
            <div className="font-black text-purple-950 mb-2.5">Tools</div>
            <ul className="space-y-1.5 font-semibold text-slate-600 text-xs">
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Jarvis AI</li>
              <li className="hover:text-purple-700 transition-colors cursor-pointer">Sync Data</li>
            </ul>
          </div>
          <div>
            <div className="font-black text-purple-950 mb-2.5">Account</div>
            <ul className="space-y-1.5 font-semibold text-slate-600 text-xs">
              <li><Link href="/login" className="hover:text-purple-700 transition-colors">Log in</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center text-xs font-bold text-purple-900/60">
          Trade Fill Rate 2026 · Milky Mist Dairy Food Pvt Ltd · Internal Use
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value, first, last }: { label: string; value: string; first?: boolean; last?: boolean }) {
  return (
    <div className={"px-4 sm:px-6 py-6 text-center " + (first ? "pl-4 " : "") + (last ? "pr-4" : "")}>
      <div className="text-[11px] font-black tracking-widest text-purple-700 uppercase">{label}</div>
      <div className="mt-1.5 text-sm font-extrabold text-purple-950 leading-snug">{value}</div>
    </div>
  );
}