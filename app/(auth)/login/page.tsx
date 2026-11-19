import { AuthForm } from "@/components/AuthForm";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const e = getEnv();
  return <AuthForm mode="login" appName={e.APP_NAME} privacyNotice={e.PRIVACY_NOTICE} />;
}
