import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { getSessionUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { fail, json, route } from "@/lib/api";
import { extOf, ACCEPT_EXTENSIONS } from "@/lib/ingestion/files";
import { uploadMode, userPrefix } from "@/lib/storage";
import { consume, pgStore } from "@/lib/quota/limits";

/** Tells the browser how to upload (blob or dev-local) and which pathname prefix it must use. */
export const GET = route({ name: "upload-config" }, async (_req, { user }) => {
  const e = getEnv();
  return json({ mode: uploadMode(), prefix: userPrefix(user.id), maxBytes: e.MAX_UPLOAD_MB * 1024 * 1024 });
});

/** Issues a short-lived client upload token. Requires login; the completion webhook is verified by the SDK. */
export const POST = route({ name: "upload-token", auth: false, ipLimitPerMin: 60 }, async (req) => {
  const mode = uploadMode();
  if (mode !== "blob" && mode !== "blob-oidc") return fail("Blob storage is not configured.", 400);
  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return fail("Invalid request.", 400);
  const e = getEnv();

  if (mode === "blob-oidc") {
    // Vercel-managed credentials: issue a presigned PUT scoped to one pathname, size-limited and short-lived.
    const body = rawBody as HandleUploadPresignedBody;
    const user = body.type === "blob.generate-presigned-url" ? await getSessionUser() : null;
    if (body.type === "blob.generate-presigned-url") {
      if (!user) return fail("Please sign in.", 401);
      await consume(pgStore, [{ scope: `u:${user.id}`, kind: "upload", period: "h", limit: 30, friendly: "Too many uploads. Please try again later." }]);
    }
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname) => {
        if (!user || !pathname.startsWith(userPrefix(user.id)) || pathname.includes("..")) throw new Error("Invalid upload path.");
        if (!ACCEPT_EXTENSIONS.includes(extOf(pathname))) throw new Error("This file type is not supported.");
        const token = await issueSignedToken({ pathname, operations: ["put"], maximumSizeInBytes: e.MAX_UPLOAD_MB * 1024 * 1024, validUntil: Date.now() + 15 * 60 * 1000 });
        return { token };
      },
      onUploadCompleted: async () => {},
    });
    return json(result);
  }

  const body = rawBody as HandleUploadBody;

  if (body.type === "blob.generate-client-token") {
    const user = await getSessionUser();
    if (!user) return fail("Please sign in.", 401);
    await consume(pgStore, [{ scope: `u:${user.id}`, kind: "upload", period: "h", limit: 30, friendly: "Too many uploads. Please try again later." }]);
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(userPrefix(user.id)) || pathname.includes("..")) throw new Error("Invalid upload path.");
        if (!ACCEPT_EXTENSIONS.includes(extOf(pathname))) throw new Error("This file type is not supported.");
        return {
          maximumSizeInBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return json(result);
  }
  const result = await handleUpload({ body, request: req, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async () => {} });
  return json(result);
});
