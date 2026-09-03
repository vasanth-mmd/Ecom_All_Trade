"use client";

import { useEffect, useState } from "react";
import { formatSyncTime } from "@/lib/date-range";

// Poll periodically so the "last synced" time reflects the latest upload.
const POLL_MS = 30_000;

/* Drop-in "Synced HH:MM:SS IST" indicator with a blinking red dot, used at
   the top of every report page. Fetches /api/data on its own so it works
   standalone regardless of what the host page already fetches.
   size "lg" is the larger Overview report-header treatment; "md" (default)
   fits inline next to a page title. dark: for pages on a dark background
   (Jarvis) where rose-600 wouldn't have enough contrast. */
export default function SyncStatus({
  size = "md",
  dark = false,
}: {
  size?: "md" | "lg";
  dark?: boolean;
}) {
  const [generated, setGenerated] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.meta?.generated && setGenerated(d.meta.generated))
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const t = formatSyncTime(generated);
  if (!t) return null;

  const big = size === "lg";
  const dot = big ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const text = big ? "text-sm sm:text-base font-bold" : "text-xs sm:text-sm font-semibold";
  const color = dark ? "text-rose-400" : "text-rose-600";
  const dotColor = dark ? "bg-rose-400" : "bg-rose-600";
  const pingColor = dark ? "bg-rose-400" : "bg-rose-600";

  return (
    <div className={"flex items-center gap-2 " + text + " " + color}>
      <span className={"relative flex shrink-0 " + dot}>
        <span className={"animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 " + pingColor} />
        <span className={"relative inline-flex rounded-full " + dot + " " + dotColor} />
      </span>
      Synced {t} IST
    </div>
  );
}
