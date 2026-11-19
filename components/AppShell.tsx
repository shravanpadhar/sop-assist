"use client";

// Placeholder shell for Phase 1; the sidebar with document list and upload arrives in Phase 5.
import { useRouter } from "next/navigation";

export function AppShell({
  user,
  appName,
  companyName,
  privacyNotice,
  children,
}: {
  user: { name: string; email: string };
  appName: string;
  companyName: string;
  privacyNotice: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
        <div>
          <span className="font-semibold">{appName}</span>
          <span className="ml-2 text-xs text-slate-300">{companyName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.name}</span>
          <button onClick={logout} className="rounded border border-white/40 px-2 py-1 hover:bg-white/10">
            Sign out
          </button>
        </div>
      </header>
      <div className="bg-amber-50 px-4 py-1 text-xs text-amber-900">{privacyNotice}</div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
