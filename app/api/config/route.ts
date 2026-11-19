import { getEnv } from "@/lib/env";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = getEnv();
  return json({
    appName: e.APP_NAME,
    companyName: e.COMPANY_NAME,
    privacyNotice: e.PRIVACY_NOTICE,
    uploadMode: e.BLOB_READ_WRITE_TOKEN ? "blob" : e.isProd ? "disabled" : "local",
    maxUploadMb: e.MAX_UPLOAD_MB,
    ttsEngine: e.TTS_ENGINE,
    hinglishSpeech: e.hinglishSpeech,
  });
}
