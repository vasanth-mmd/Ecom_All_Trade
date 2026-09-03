"use client";

import { useEffect } from "react";

export type SkuStat = { label: string; value: string; cls?: string };

/* Shared lightbox opened by clicking a SKU logo anywhere in the dashboard:
   the product photo enlarged, plus whatever stat columns that table has
   for the row (caller decides which stats — the shape differs per table). */
export default function SkuImagePopup({
  icon,
  name,
  stats,
  onClose,
}: {
  icon: string | null;
  name: string;
  stats: SkuStat[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} />
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="text-sm font-bold text-slate-900 truncate pr-3">{name}</div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 grid place-items-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
          <div className="grid place-items-center bg-slate-50 border-b border-slate-200 py-6">
            <div className="w-32 h-32 rounded-2xl bg-white border border-slate-200 shadow-sm grid place-items-center overflow-hidden">
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-4xl">🥛</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[10px] font-semibold text-slate-400 tracking-wider">{s.label}</div>
                <div className={"font-semibold text-slate-800 " + (s.cls || "")}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
