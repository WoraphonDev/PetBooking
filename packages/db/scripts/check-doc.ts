// pnpm --filter @app/db check:doc — Drizzle schema (src/schema) ⇄ docs/spec/02-data-model.md must match exactly:
// tables, columns, SQL types, nullability, default presence, FK target, named indexes/uniques/checks, enums and their values.
import { readFileSync } from "node:fs";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/schema/index";

const DOC = new URL("../../../docs/spec/02-data-model.md", import.meta.url);
const md = readFileSync(DOC, "utf8");
const errors: string[] = [];

type DocCol = { type: string; nullable: boolean; hasDefault: boolean; fk: string | null };
type DocTable = { cols: Map<string, DocCol>; named: Set<string> };
const docTables = new Map<string, DocTable>();
const blocks = md.split(/<a id="tbl-/).slice(1);
for (const block of blocks) {
  const name = block.slice(0, block.indexOf('"'));
  const body = block.split(/\n## /)[0] ?? "";
  const t: DocTable = { cols: new Map(), named: new Set() };
  for (const line of body.split("\n")) {
    const m = line.match(/^\| (\w+) \| `([^`]+)` \| (NO|YES) \| (.*?) \| (.*?) \| .*\|$/);
    if (m) {
      const fk = (m[5] ?? "").trim().match(/^(\w+\.\w+)/)?.[1] ?? null;
      t.cols.set(m[1]!, { type: m[2]!, nullable: m[3] === "YES", hasDefault: (m[4] ?? "").trim() !== "", fk });
    }
    const n = line.match(/^- (UNIQUE|INDEX|CHECK) `([^`]+)`/);
    if (n) t.named.add(n[2]!);
  }
  docTables.set(name, t);
}

const docEnums = new Map<string, string[]>();
const enumSection = md.split("## 12. Enums")[1]?.split("\n## ")[0] ?? "";
for (const line of enumSection.split("\n")) {
  const m = line.match(/^\| `(\w+)` \| (.*?) \|/);
  if (m)
    docEnums.set(
      m[1]!,
      [...(m[2] ?? "").matchAll(/`([^`]+)`/g)].map((x) => x[1]!),
    );
}

const normType = (t: string) => t.replace("timestamp with time zone", "timestamptz").replace("timestamp without time zone", "timestamp");
const seenTables = new Set<string>();
const seenEnums = new Set<string>();

for (const value of Object.values(schema)) {
  if (is(value, PgTable)) {
    const cfg = getTableConfig(value);
    seenTables.add(cfg.name);
    const doc = docTables.get(cfg.name);
    if (!doc) {
      errors.push(`table ${cfg.name}: in schema but not in 02`);
      continue;
    }
    const seenCols = new Set<string>();
    for (const col of cfg.columns) {
      seenCols.add(col.name);
      const d = doc.cols.get(col.name);
      const where = `${cfg.name}.${col.name}`;
      if (!d) {
        errors.push(`${where}: in schema but not in 02`);
        continue;
      }
      const type = normType(col.getSQLType());
      if (type !== d.type) errors.push(`${where}: type ${type} ≠ 02 ${d.type}`);
      if (col.notNull === d.nullable) errors.push(`${where}: nullable ${!col.notNull} ≠ 02 ${d.nullable}`);
      if (col.hasDefault !== d.hasDefault) errors.push(`${where}: default ${col.hasDefault ? "present" : "absent"} ≠ 02`);
    }
    for (const c of doc.cols.keys()) if (!seenCols.has(c)) errors.push(`${cfg.name}.${c}: in 02 but not in schema`);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const from = ref.columns[0]?.name;
      const to = `${getTableConfig(ref.foreignTable).name}.${ref.foreignColumns[0]?.name}`;
      const d = from ? doc.cols.get(from) : undefined;
      if (d && d.fk !== to) errors.push(`${cfg.name}.${from}: FK → ${to} ≠ 02 ${d.fk ?? "(none)"}`);
    }
    const named = new Set<string>([
      ...cfg.indexes.map((i) => i.config.name ?? ""),
      ...cfg.checks.map((c) => c.name),
      ...cfg.uniqueConstraints.map((u) => u.getName() ?? ""),
    ]);
    for (const n of named) if (n && !doc.named.has(n)) errors.push(`${cfg.name}: index/check ${n} not in 02`);
    for (const n of doc.named) if (!named.has(n)) errors.push(`${cfg.name}: index/check ${n} in 02 but not in schema`);
  } else if (typeof value === "function" && "enumName" in value && "enumValues" in value) {
    const name = (value as { enumName: string }).enumName;
    const vals = [...(value as { enumValues: string[] }).enumValues];
    seenEnums.add(name);
    const d = docEnums.get(name);
    if (!d) errors.push(`enum ${name}: in schema but not in 02`);
    else if (d.join(",") !== vals.join(",")) errors.push(`enum ${name}: [${vals}] ≠ 02 [${d}]`);
  }
}
for (const t of docTables.keys()) if (!seenTables.has(t)) errors.push(`table ${t}: in 02 but not in schema`);
for (const e of docEnums.keys()) if (!seenEnums.has(e)) errors.push(`enum ${e}: in 02 but not in schema`);

if (errors.length) {
  console.error(`check:doc FAILED — ${errors.length} difference(s) between src/schema and docs/spec/02-data-model.md:`);
  for (const e of errors) console.error("  - " + e);
  console.error("แก้ให้ตรงกัน: เปลี่ยน 02 ผ่าน tools/spec-src (spec-change) หรือแก้ schema ให้ตรง 02");
  process.exit(1);
}
console.log(`check:doc OK — ${seenTables.size} tables, ${seenEnums.size} enums match 02`);
