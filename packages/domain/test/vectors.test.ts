// Starter-kit harness — DO NOT EDIT (agents: read-only).
// Loads every docs/spec/vectors/R-xx.<export>.json listed in rule-modules.json.
// Module/export not written yet → it.todo; written → every case must match `expected` exactly (toStrictEqual).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url);
const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, ROOT), "utf8"));
type Mod = { rule: string; export: string; file: string; vectors: string };
type Vec = { cases: { name: string; input: unknown; expected: unknown }[] };
const modules: Mod[] = read("docs/spec/vectors/rule-modules.json").modules;

const loaded = await Promise.all(
  modules.map(async (m) => {
    const url = new URL(m.file, ROOT);
    const mod: Record<string, unknown> | null = existsSync(url) ? await import(url.href) : null;
    const fn = mod?.[m.export];
    return { m, vec: read(`docs/spec/vectors/${m.vectors}`) as Vec, fn: typeof fn === "function" ? (fn as (i: unknown) => unknown) : null };
  }),
);

for (const { m, vec, fn } of loaded) {
  describe(`${m.rule} ${m.export} (${m.file})`, () => {
    if (!fn) {
      it.todo(`not implemented yet — ${vec.cases.length} vectors waiting`);
      return;
    }
    for (const c of vec.cases) {
      it(c.name, () => {
        expect(fn(structuredClone(c.input))).toStrictEqual(c.expected);
      });
    }
  });
}
