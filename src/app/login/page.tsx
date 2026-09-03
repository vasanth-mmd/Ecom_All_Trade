"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LiveBackground from "../live-background";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center bg-transparent overflow-hidden px-4 py-12 select-none">
      {/* ── Live background canvas (aurora, neural network, constellation, magnetic glow) ── */}
      <LiveBackground />

      {/* ── Top-left back to home link ── */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/80 border border-purple-200/80 shadow-md shadow-purple-950/5 backdrop-blur-md text-sm font-bold text-purple-950 hover:bg-white hover:border-purple-300 hover:shadow-lg hover:shadow-purple-500/15 hover:-translate-y-0.5 active:scale-95 transition-all duration-300"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          <span>Back to Home</span>
        </Link>
      </div>

      {/* ── Center Login Card with Glassmorphic AI Styling ── */}
      <div className="relative z-10 w-full max-w-md">
        {/* Ambient background glow behind the card */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-purple-600/30 via-fuchsia-500/30 to-amber-500/20 blur-xl opacity-80 pointer-events-none" />

        <div className="relative rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/90 shadow-2xl shadow-purple-950/15 p-7 sm:p-9">
          {/* Header Brand & Icon */}
          <div className="text-center mb-8">
            <div className="relative w-16 h-16 mx-auto mb-4 group">
              {/* Pulsing halo */}
              <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-amber-400 opacity-70 blur-md group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-purple-950 via-purple-900 to-fuchsia-900 border border-purple-300/40 grid place-items-center font-black text-2xl shadow-inner">
                <span className="bg-gradient-to-br from-orange-300 via-rose-300 to-amber-200 bg-clip-text text-transparent">
                  M
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100/80 border border-purple-200/80 text-purple-800 text-xs font-bold tracking-wide mb-2 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              TRADE FR · 2026
            </div>

            <h1 className="text-2xl font-extrabold text-purple-950 tracking-tight">
              Welcome Back
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-600">
              Sign in to access your Trade Fill Rate intelligence dashboard.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm font-semibold text-red-600 bg-red-50/90 border border-red-200 rounded-xl px-4 py-3 shadow-sm animate-fade-up">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-purple-900 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-purple-200/90 bg-white/95 px-4 py-3 text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm transition-all"
                placeholder="you@milky-mist.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-900">
                  Password
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-purple-200/90 bg-white/95 px-4 py-3 text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm transition-all"
                placeholder="••••••••"
              />
            </div>

            {/* AI-Powered Login Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="glow-border group relative w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 px-6 font-bold text-white text-base shadow-xl shadow-purple-900/30 hover:shadow-2xl hover:shadow-purple-700/40 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 overflow-hidden disabled:opacity-60 cursor-pointer"
              >
                {/* animated gradient bg */}
                <span className="absolute inset-0 bg-gradient-to-r from-purple-700 via-fuchsia-600 to-indigo-600 bg-[length:200%_100%] animate-btn-gradient rounded-xl" />
                {/* glass overlay */}
                <span className="absolute inset-[1px] rounded-[11px] bg-gradient-to-b from-white/25 to-transparent" />
                {/* shimmer light beam */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 transition-transform ease-in-out" />
                {/* sparkle particles */}
                <span className="sparkle sparkle-1" />
                <span className="sparkle sparkle-2" />
                <span className="sparkle sparkle-3" />

                <span className="relative z-10 flex items-center gap-2 tracking-wide font-extrabold">
                  {loading ? (
                    <>
                      <span className="animate-spin text-lg">⏳</span>
                      <span>Logging in…</span>
                    </>
                  ) : (
                    <>
                      <span className="text-amber-300 text-lg group-hover:rotate-12 transition-transform duration-300">✦</span>
                      <span>Log In to Dashboard</span>
                      <span className="text-white/80 group-hover:translate-x-1 transition-transform">→</span>
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>

          {/* Footer note */}
          
        </div>

        {/* Brand note bottom */}
        <div className="mt-6 text-center text-xs font-semibold text-purple-900/60">
          Milky Mist Dairy Food Pvt Ltd · Secure Internal Portal
        </div>
      </div>
    </main>
  );
}
