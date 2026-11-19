import { fail, json, route } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { saveLocal, uploadMode } from "@/lib/storage";
import { validateUpload } from "@/lib/ingestion/files";

/** Development-only upload target used when BLOB_READ_WRITE_TOKEN is missing. Never available in production. */
export const PUT = route({ name: "dev-upload" }, async (req, { user }) => {
  if (uploadMode() !== "local") return fail("Not found.", 404);
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const data = Buffer.from(await req.arrayBuffer());
  const e = getEnv();
  const bad = validateUpload(name, data.length, req.headers.get("x-file-type") ?? "", e.MAX_UPLOAD_MB);
  if (bad) return fail(bad, 400);
  const url = await saveLocal(user.id, name, data);
  return json({ url });
});
