import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass)
    return NextResponse.json({ ok: false, error: "ADMIN_PASSCODE is not set in .env" });
  let body: any = {};
  try { body = await req.json(); } catch {}
  return NextResponse.json({ ok: String(body?.code || "") === pass });
}
