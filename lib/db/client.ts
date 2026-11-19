import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env.local.");
  return drizzle(neon(url), { schema });
}

let _db: ReturnType<typeof make> | null = null;
/** Lazy so that importing this module never fails at build time. */
export function db() {
  return (_db ??= make());
}
export type DB = ReturnType<typeof db>;
