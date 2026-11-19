"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AuthForm({ mode, appName, privacyNotice }: { mode: "login" | "register"; appName: string; privacyNotice: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none";
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-navy">{appName}</h1>
        <p className="mb-6 text-sm text-muted">{mode === "login" ? "Sign in to continue" : "Create your account"}</p>
        <form onSubmit={submit} className="space-y-4" aria-label={mode === "login" ? "Sign in" : "Register"}>
          {mode === "register" && (
            <label className="block text-sm">
              Name
              <input name="name" autoComplete="name" className={input} />
            </label>
          )}
          <label className="block text-sm">
            Email
            <input name="email" type="email" required autoComplete="email" className={input} />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button disabled={busy} className="w-full rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          {mode === "login" ? (
            <>
              No account? <Link className="text-teal-700 underline" href="/register">Register</Link>
            </>
          ) : (
            <>
              Already registered? <Link className="text-teal-700 underline" href="/login">Sign in</Link>
            </>
          )}
        </p>
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-xs text-amber-900">{privacyNotice}</p>
      </div>
    </main>
  );
}
