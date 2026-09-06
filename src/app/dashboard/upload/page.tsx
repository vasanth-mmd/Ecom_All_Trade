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
    try {
      const d = await uploadDataFile(file, code);
      setMsg({ ok: true, text: d.message });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploadSuccess();
      router.refresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mt-5 text-sm text-slate-500">
        Upload a Trade FR Raw Data file (.xlsx, .xls or .csv) directly from
        your computer. The file will be saved in the <b>download folder</b> on the server,
        and its records will update the live dashboard dataset.
      </p>

      <div className="mt-6 border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center bg-white border-indigo-300">
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
          className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 transition"
        >
          {busy ? "Uploading & Saving…" : "Upload & save to download folder"}
        </button>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📁</span> Stored in Download Folder
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

