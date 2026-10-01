#!/usr/bin/env node
// pnpm --filter @app/domain vectors:status [R-xx]  → which rule exports are implemented / still todo
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const filter = process.argv[2];
const { modules } = JSON.parse(readFileSync(new URL("docs/spec/vectors/rule-modules.json", ROOT), "utf8"));
let done = 0,
  todo = 0;
for (const m of modules) {
  if (filter && m.rule !== filter) continue;
  const url = new URL(m.file, ROOT);
  const src = existsSync(url) ? readFileSync(url, "utf8") : "";
  const has = new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m.export}\\b`).test(src);
  const n = JSON.parse(readFileSync(new URL(`docs/spec/vectors/${m.vectors}`, ROOT), "utf8")).cases.length;
  has ? done++ : todo++;
  console.log(`${has ? "✅" : "⬜"} ${m.rule.padEnd(5)} ${m.export.padEnd(28)} ${String(n).padStart(3)} cases  ${m.file}`);
}
console.log(`\n${done} implemented · ${todo} todo  (run \`pnpm --filter @app/domain test\` to check implemented ones against vectors)`);
