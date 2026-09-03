import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SideNav from "./side-nav";
import Ticker from "./ticker";
import GlobalJarvis from "./global-jarvis";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="h-screen flex bg-slate-50">
      <SideNav email={session.user?.email ?? ""} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-14 md:pt-0">
        <Ticker />
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-amber-100/80 via-amber-50/40 to-indigo-100/70">{children}</div>
      </main>
      <GlobalJarvis />
    </div>
  );
}
