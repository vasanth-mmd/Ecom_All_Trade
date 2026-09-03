export type TickerSyncPayload = {
  activeViewTitle?: string;
  selectedStatuses?: string[];
  poVal: number;
  poQty: number;
  grnVal: number;
  grnQty: number;
  gapVal: number;
  frVal: number;
  frQty: number;
  poCount: number;
  statusBreakdown?: {
    status: string;
    poVal: number;
    grnVal: number;
    gapVal: number;
    frVal: number;
    poCount: number;
  }[];
  trades?: { name: string; poVal: number; grnVal: number; frVal: number; gapVal: number }[];
  cities?: { name: string; gapVal: number; poVal: number; grnVal: number; frVal: number }[];
};

export function broadcastTickerSync(payload: TickerSyncPayload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trade_fr:ticker_sync", { detail: payload }));
  }
}
