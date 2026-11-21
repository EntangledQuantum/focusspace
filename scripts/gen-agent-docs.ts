#!/usr/bin/env npx tsx
/**
 * Writes docs/for-agents.md from the guide served at /for-agents.md, so the
 * raw GitHub URL always matches. Run after editing src/lib/agent/for-agents.md.ts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { FOR_AGENTS_MD } from "../src/lib/agent/for-agents.md";

const out = path.join(__dirname, "..", "docs", "for-agents.md");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, FOR_AGENTS_MD);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
