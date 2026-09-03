/* "Date Range" label, e.g. "1-24th July" — mirrors the source Excel's Date Range column */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const splitYmd = (ymd: number) => ({ y: Math.floor(ymd / 10000), m: Math.floor((ymd % 10000) / 100), day: ymd % 100 });

export const dateRangeLabel = (minD?: number, maxD?: number) => {
  if (!minD || !maxD) return "";
  const a = splitYmd(minD), b = splitYmd(maxD);
  if (a.y === b.y && a.m === b.m) return `${a.day}-${ordinal(b.day)} ${MONTHS[a.m - 1]}`;
  if (a.y === b.y) return `${a.day} ${MONTHS[a.m - 1].slice(0, 3)} - ${b.day} ${MONTHS[b.m - 1].slice(0, 3)}`;
  return `${a.day} ${MONTHS[a.m - 1].slice(0, 3)} ${a.y} - ${b.day} ${MONTHS[b.m - 1].slice(0, 3)} ${b.y}`;
};

/* meta.generated is "YYYY-MM-DD HH:MM:SS" in UTC (see src/lib/dataset.ts) — format to IST clock time. */
export const formatSyncTime = (generated?: string) => {
  if (!generated) return "";
  const d = new Date(generated.replace(" ", "T") + "Z");
  if (isNaN(+d)) return "";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

