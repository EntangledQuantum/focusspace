#!/usr/bin/env node
/**
 * Reads .env.local and exports two files:
 *   supabase-env.txt  — for Docker (--env-file flag)
 *   vercel-env.txt    — paste into Vercel dashboard or pipe to `vercel env add`
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env.local");

let raw;
try {
  raw = readFileSync(envPath, "utf-8");
} catch {
  console.error("❌  .env.local not found. Run `node scripts/setup-env.mjs` first.");
  process.exit(1);
}

const lines = raw
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"));

// Docker env-file format (KEY=VALUE, one per line)
writeFileSync("supabase-env.txt", lines.join("\n") + "\n");

// Vercel format — same content, but with a header comment
const vercelContent = [
  "# Paste these values in Vercel → Project → Settings → Environment Variables",
  "# Or use: vercel env add <KEY> <value>",
  ...lines,
].join("\n");
writeFileSync("vercel-env.txt", vercelContent + "\n");

console.log("✅  supabase-env.txt  — use with: docker run --env-file supabase-env.txt ...");
console.log("✅  vercel-env.txt    — paste into Vercel dashboard");
console.log("\nReminder: add these files to .gitignore!\n");
