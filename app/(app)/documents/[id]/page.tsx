import { DocumentView } from "@/components/DocumentView";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = getEnv();
  return <DocumentView id={id} ttsEngine={e.TTS_ENGINE} hinglishSpeech={e.hinglishSpeech} />;
}
