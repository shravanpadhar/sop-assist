import { UploadZone } from "@/components/UploadZone";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const e = getEnv();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Ask your SOP anything</h1>
          <p className="mt-1 text-sm text-muted">Upload a Standard Operating Procedure, then ask questions by voice or text in English, Hindi or Hinglish. Answers come only from your document, with citations.</p>
        </div>
        <UploadZone maxMb={e.MAX_UPLOAD_MB} />
        <ul className="grid gap-3 text-sm text-ink sm:grid-cols-3">
          {[
            ["1. Upload", "PDF, Word, Excel, CSV, Markdown or text. Scans are read automatically."],
            ["2. Review", "A summary, roles, warnings and starter questions appear in seconds."],
            ["3. Ask", "Type or tap the mic. Replies match your language and can be read aloud."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg bg-white p-4 shadow-sm">
              <p className="font-semibold text-navy">{t}</p>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
