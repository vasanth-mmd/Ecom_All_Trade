"use client";

import { useEffect, useRef, useState } from "react";
import { uploadDataFile } from "@/lib/client-upload";

/* Compact "Upload Data" control usable on any page — a small dropdown to
   upload a Trade FR Raw Data file directly (admin passcode required, since
   this overwrites the stored dataset). This is the only way the dashboard's
   data ever changes — there is no external/automatic sync. See
   /dashboard/upload for the full-page version of the same panel.
   variant: "dark" (Overview report) or "light" (Reports / default). */

type Msg = { ok: boolean; text: string } | null;

export default function UploadButton({ variant = "light" }: { variant?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dark = variant === "dark";
  const btn = dark
    ? "px-3 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-semibold hover:bg-sky-400"
    : "px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function doUpload() {
    if (busy) return;
    if (!file) { setMsg({ ok: false, text: "Choose a file first." }); return; }
    if (!code) { setMsg({ ok: false, text: "Enter the admin passcode." }); return; }
    setBusy(true); setMsg(null);
    setProgressMsg("Starting upload...");
    setProgressPct(5);
    try {
      const d = await uploadDataFile(file, code, (status, pct) => {
        setProgressMsg(status);
        setProgressPct(pct);
      });
      setMsg({ ok: true, text: d.message });
      setTimeout(() => location.reload(), 1500);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  return (
    <span className="relative inline-block" ref={boxRef}>
      <button
        className={btn}
        onClick={() => { setOpen((o) => !o); setMsg(null); }}
      >
        ⭱ Upload Data
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl text-left">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500">
            ⭱ Data Upload
          </div>

          <div className="p-3">
            <p className="text-xs text-slate-500 mb-2">
              Upload a .xlsx / .xls / .csv Raw Data file. Requires the admin
              passcode. This replaces the currently stored dataset and syncs directly to Supabase.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 truncate"
            >
              {file ? file.name : "Choose file…"}
            </button>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Admin passcode"
              className="mt-2 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={doUpload}
              disabled={busy || !file}
              className="mt-2 w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 transition"
            >
              {busy ? (progressMsg || "Uploading…") : "Upload & replace data"}
            </button>

            {busy && (
              <div className="mt-2.5">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span className="truncate">{progressMsg}</span>
                  <span className="font-semibold">{progressPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {msg && (
              <div
                className={
                  "mt-2 rounded-lg border px-2.5 py-2 text-xs " +
                  (msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700")
                }
              >
                {msg.ok ? "✅ " : "⚠️ "}{msg.text}
                {msg.ok && <div className="mt-0.5 text-emerald-700">Refreshing…</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
