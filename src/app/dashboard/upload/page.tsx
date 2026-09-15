"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDataFile } from "@/lib/client-upload";

type Msg = { ok: boolean; text: string } | null;

interface StoredFile {
  name: string;
  size: number;
  sizeFormatted: string;
  modified: string;
  url: string;
}

export default function UploadPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">⭱ Upload Data</h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload a Trade FR Raw Data file to populate every dashboard, the ticker, and Jarvis.
        Uploaded files are automatically stored in the server&apos;s <b>download folder</b> and can be downloaded anytime.
      </p>

      <FileUploadPanel onUploadSuccess={() => setRefreshKey((k) => k + 1)} />

      <StoredFilesPanel refreshKey={refreshKey} />
    </div>
  );
}

function FileUploadPanel({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doUpload() {
    if (!file) {
      setMsg({ ok: false, text: "Choose a file first." });
      return;
    }
    if (!code) {
      setMsg({ ok: false, text: "Enter the admin passcode." });
      return;
    }
    setBusy(true);
    setMsg(null);
    setProgressMsg("Starting upload...");
    setProgressPct(5);
    try {
      const d = await uploadDataFile(file, code, (status, pct) => {
        setProgressMsg(status);
        setProgressPct(pct);
      });
      setMsg({ ok: true, text: d.message });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploadSuccess();
      router.refresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  return (
    <>
      <p className="mt-5 text-sm text-slate-500">
        Upload a Trade FR Raw Data file (.xlsx, .xls or .csv) directly from
        your computer. Records will be processed and saved directly into <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs font-semibold">data.json</code> and <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-xs font-semibold">data.js</code> files to immediately update the live dashboard with zero database dependency.
      </p>

      <div className="mt-6 border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center bg-white border-indigo-300 shadow-sm">
        <div className="text-4xl">⭱</div>
        <div className="mt-2 font-semibold text-slate-800">
          {file ? file.name : "Choose a .xlsx / .xls / .csv file"}
        </div>

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
          className="mt-4 px-5 py-2.5 rounded-xl bg-white border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition"
        >
          Browse files
        </button>

        <div className="mt-5 max-w-xs mx-auto text-left">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Admin passcode
          </label>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter passcode"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <button
          onClick={doUpload}
          disabled={busy || !file}
          className="mt-4 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 transition"
        >
          {busy ? (progressMsg || "Uploading & Processing…") : "Upload & Save to JS / JSON"}
        </button>

        {busy && (
          <div className="mt-4 max-w-sm mx-auto">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span className="truncate font-medium">{progressMsg}</span>
              <span className="font-bold text-indigo-600">{progressPct}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {msg && <ResultBox msg={msg} />}

      <div className="mt-8 text-xs text-slate-400 leading-relaxed">
        The file must use the same columns as the Raw Data sheet (PO Number,
        Trade, City, Region, Category, SKU Name, PO Qty, Po Value, GRN Qty,
        GRN Value, Po Date, PO Status, Month).
      </div>
    </>
  );
}

function StoredFilesPanel({ refreshKey }: { refreshKey: number }) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/download");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [refreshKey]);

  return (
    <div className="mt-10 pt-8 border-t border-slate-200">
      {/* Direct JS and JSON Download Cards */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>⚡</span> Active JS & JSON Data Files
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          The dashboard directly runs on these compiled file snapshots. You can download or view them anytime:
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <div className="text-sm font-bold text-purple-950 font-mono">data.json</div>
                <div className="text-xs text-purple-700">Raw JSON dataset format</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/data"
                target="_blank"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 text-xs font-semibold"
              >
                View
              </a>
              <a
                href="/api/data"
                download="data.json"
                className="px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>⬇️</span> Download
              </a>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <div className="text-sm font-bold text-indigo-950 font-mono">data.js</div>
                <div className="text-xs text-indigo-700">Client-side JS variable (window.TRADE_FR)</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/datajs"
                target="_blank"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
              >
                View
              </a>
              <a
                href="/api/datajs"
                download="data.js"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>⬇️</span> Download
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📁</span> Stored Files in Download Folder
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Files stored on server in the <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono">download</code> directory
          </p>
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <div className="mt-4 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {loading && files.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">Loading files in download folder…</div>
        ) : files.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            No files stored in download folder yet. Upload a file above to store it here.
          </div>
        ) : (
          files.map((f) => (
            <div key={f.name} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">📄</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate" title={f.name}>
                    {f.name}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{f.sizeFormatted}</span>
                    <span>•</span>
                    <span>{new Date(f.modified).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                </div>
              </div>
              <a
                href={f.url}
                download={f.name}
                className="ml-4 shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition"
              >
                <span>⬇️</span> Download
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ResultBox({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <div
      className={
        "mt-5 rounded-xl px-4 py-3 text-sm border " +
        (msg.ok
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-rose-50 border-rose-200 text-rose-700")
      }
    >
      {msg.ok ? "✅ " : "⚠️ "}
      {msg.text}
      {msg.ok && (
        <div className="mt-1 text-emerald-700">
          Open the <a href="/dashboard" className="underline font-medium">Overview</a> or{" "}
          <a href="/dashboard/full" className="underline font-medium">Full Dashboard</a> to see it.
        </div>
      )}
    </div>
  );
}

