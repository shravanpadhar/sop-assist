export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { envProblems } = await import("./lib/env");
  const problems = envProblems();
  if (problems.length === 0) return;
  const msg = `SOP Assist configuration problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`;
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn(msg); // dev: warn so the UI still loads
}
