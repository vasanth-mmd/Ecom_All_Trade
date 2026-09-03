import { getDataset } from "@/lib/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getDataset();
    return new Response("window.TRADE_FR=" + JSON.stringify(data) + ";", {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (e: any) {
    return new Response("/* dataset error: " + e.message + " */", {
      headers: { "Content-Type": "text/javascript" }, status: 500,
    });
  }
}
