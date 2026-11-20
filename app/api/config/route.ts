import { getEnv } from "@/lib/env";
import { json, route } from "@/lib/api";
import { uploadMode } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = route({ name: "config", auth: false, ipLimitPerMin: 120 }, async () => {
  const e = getEnv();
  return json({
    appName: e.APP_NAME,
    companyName: e.COMPANY_NAME,
    privacyNotice: e.PRIVACY_NOTICE,
    uploadMode: uploadMode(),
    maxUploadMb: e.MAX_UPLOAD_MB,
    ttsEngine: e.TTS_ENGINE,
    hinglishSpeech: e.hinglishSpeech,
  });
});
