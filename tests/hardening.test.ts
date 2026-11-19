import { describe, it, expect } from "vitest";
import { originAllowed } from "@/lib/api";
import { retentionCutoff } from "@/lib/retention";
import { isAllowedUploadUrl } from "@/lib/storage";
import { sanitizeFilename } from "@/lib/ingestion/files";

const req = (method: string, headers: Record<string, string>) => ({ method, headers: new Headers(headers) });

describe("origin check", () => {
  it("allows same-origin and header-less requests, blocks cross-site writes", () => {
    expect(originAllowed(req("POST", { origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
    expect(originAllowed(req("POST", { origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(originAllowed(req("POST", { host: "app.example.com" }))).toBe(true);
    expect(originAllowed(req("GET", { origin: "https://evil.example", host: "app.example.com" }))).toBe(true);
    expect(originAllowed(req("DELETE", { origin: "not a url", host: "x" }))).toBe(false);
  });
});

describe("retention", () => {
  it("computes cutoffs and treats 0 as keep forever", () => {
    expect(retentionCutoff(0)).toBeNull();
    expect(retentionCutoff(30, new Date("2026-02-01T00:00:00Z"))?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("upload reference safety", () => {
  it("only accepts blob URLs under the caller's own prefix", () => {
    const u = "11111111-1111-1111-1111-111111111111";
    expect(isAllowedUploadUrl(`https://abc.private.blob.vercel-storage.com/u/${u}/file-xyz.pdf`, u)).toBe(true);
    expect(isAllowedUploadUrl(`https://abc.private.blob.vercel-storage.com/u/22222222-2222-2222-2222-222222222222/file.pdf`, u)).toBe(false);
    expect(isAllowedUploadUrl(`https://evil.example.com/u/${u}/file.pdf`, u)).toBe(false);
    expect(isAllowedUploadUrl(`http://abc.blob.vercel-storage.com/u/${u}/file.pdf`, u)).toBe(false);
    expect(isAllowedUploadUrl(`file:///etc/passwd`, u)).toBe(false);
    expect(isAllowedUploadUrl(`local:${u}/../../secret`, u)).toBe(false);
  });
  it("sanitizes hostile filenames", () => {
    expect(sanitizeFilename("..\\..\\windows\\system32\\a.pdf")).toBe("a.pdf");
    expect(sanitizeFilename("<script>.pdf")).not.toMatch(/[<>]/);
  });
});
