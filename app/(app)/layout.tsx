import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const e = getEnv();
  return (
    <AppShell user={{ name: user.name || user.email, email: user.email }} appName={e.APP_NAME} companyName={e.COMPANY_NAME} privacyNotice={e.PRIVACY_NOTICE}>
      {children}
    </AppShell>
  );
}
