#!/usr/bin/env npx tsx
/**
 * Writes docs/for-agents.md (self-host) and docs/for-agents-cloud.md (hosted)
 * from the guides served at /for-agents.md and /for-agents/cloud.md, so the
 * raw GitHub URLs always match. Run after editing src/lib/agent/for-agents.md.ts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { FOR_AGENTS_MD, FOR_AGENTS_CLOUD_MD } from "../src/lib/agent/for-agents.md";

const dir = path.join(__dirname, "..", "docs");
mkdirSync(dir, { recursive: true });
for (const [name, body] of [["for-agents.md", FOR_AGENTS_MD], ["for-agents-cloud.md", FOR_AGENTS_CLOUD_MD]] as const) {
  const out = path.join(dir, name);
  writeFileSync(out, body);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}
