#!/usr/bin/env node
// Merge src/i18n/messages/th/<NAMESPACE>.json → src/i18n/messages/th.generated.json (gitignored), one top-level key per file.
// Namespace = file name: common, enum, and one file per screen (<SCREEN-ID>.json, 01 §2). Runs before dev/build/typecheck/test.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = new URL("../src/i18n/messages/th/", import.meta.url);
const OUT = new URL("../src/i18n/messages/th.generated.json", import.meta.url);
const NAMESPACE_RE = /^[A-Za-z0-9-]+$/;

const merged = {};
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const namespace = file.slice(0, -".json".length);
  if (!NAMESPACE_RE.test(namespace)) throw new Error(`messages/th/${file}: namespace must match ${NAMESPACE_RE}`);
  let content;
  try {
    content = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
  } catch (e) {
    throw new Error(`messages/th/${file}: invalid JSON — ${e.message}`);
  }
  if (content === null || typeof content !== "object" || Array.isArray(content))
    throw new Error(`messages/th/${file}: must be a JSON object`);
  merged[namespace] = content;
}

writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`merge-messages: ${Object.keys(merged).length} namespace(s) → src/i18n/messages/th.generated.json`);
