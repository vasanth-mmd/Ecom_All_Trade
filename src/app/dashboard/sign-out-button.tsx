"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 transition"
    >
      Sign out
    </button>
  );
}
