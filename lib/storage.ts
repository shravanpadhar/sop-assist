import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { del, get } from "@vercel/blob";
import { getEnv } from "@/lib/env";
import { sanitizeFilename } from "@/lib/ingestion/files";

const LOCAL_DIR = path.join(process.cwd(), ".local-uploads");
export const LOCAL_PREFIX = "local:";

export function uploadMode(): "blob" | "local" | "disabled" {
  const e = getEnv();
  if (e.BLOB_READ_WRITE_TOKEN) return "blob";
  return e.isProd ? "disabled" : "local";
}

/** Each user may only reference blobs stored under their own prefix. */
export function userPrefix(userId: string) {
  return `u/${userId}/`;
}

function blobPathname(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com")) return null;
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

export function isAllowedUploadUrl(url: string, userId: string): boolean {
  if (url.startsWith(LOCAL_PREFIX)) {
    return uploadMode() === "local" && url.startsWith(`${LOCAL_PREFIX}${userId}/`) && !url.includes("..");
  }
  const p = blobPathname(url);
  return !!p && p.startsWith(userPrefix(userId));
}

export async function saveLocal(userId: string, filename: string, data: Buffer): Promise<string> {
  if (uploadMode() !== "local") throw new Error("Local uploads are disabled.");
  const name = `${randomUUID().slice(0, 8)}-${sanitizeFilename(filename)}`;
  const dir = path.join(LOCAL_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), data);
  return `${LOCAL_PREFIX}${userId}/${name}`;
}

function localPath(url: string) {
  const rel = url.slice(LOCAL_PREFIX.length);
  const full = path.resolve(LOCAL_DIR, rel);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error("Invalid local path.");
  return full;
}

export async function readUpload(url: string): Promise<Buffer> {
  if (url.startsWith(LOCAL_PREFIX)) return fs.readFile(localPath(url));
  const pathname = blobPathname(url);
  if (!pathname) throw new Error("Invalid blob URL.");
  const res = await get(pathname, { access: "private" });
  if (!res || !res.stream) throw new Error("Uploaded file was not found.");
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export async function deleteUpload(url: string | null | undefined) {
  if (!url) return;
  try {
    if (url.startsWith(LOCAL_PREFIX)) await fs.rm(localPath(url), { force: true });
    else await del(url);
  } catch {
    /* best effort */
  }
}
